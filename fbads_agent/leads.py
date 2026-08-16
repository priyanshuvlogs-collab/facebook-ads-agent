"""Lead manager: fetch, dedupe, score, and deliver leads to your CRM.

Delivery targets:
* CSV file (always) -- appended under AGENT_HOME/exports/
* Webhook (optional) -- JSON POST per lead to LEAD_WEBHOOK_URL (Zapier/Make/
  n8n/any CRM endpoint), which is how you plug this into virtually any stack.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import requests

from .meta_client import MetaClient
from .profile import BusinessProfile
from .settings import Settings
from .state import StateStore


@dataclass
class Lead:
    id: str
    created_time: str
    full_name: str = ""
    email: str = ""
    phone: str = ""
    campaign_id: str = ""
    adset_id: str = ""
    score: int = 0
    grade: str = "C"
    extra_fields: dict[str, str] = field(default_factory=dict)


def parse_lead(raw: dict[str, Any]) -> Lead:
    lead = Lead(
        id=raw.get("id", ""),
        created_time=raw.get("created_time", ""),
        campaign_id=raw.get("campaign_id", ""),
        adset_id=raw.get("adset_id", ""),
    )
    for item in raw.get("field_data", []) or []:
        name = str(item.get("name", "")).lower()
        values = item.get("values") or [""]
        value = str(values[0])
        if name in {"full_name", "full name", "name"}:
            lead.full_name = value
        elif "email" in name:
            lead.email = value
        elif "phone" in name:
            lead.phone = value
        else:
            lead.extra_fields[name] = value
    return lead


def score_lead(lead: Lead, profile: BusinessProfile) -> Lead:
    """Simple, explainable scoring: completeness + keyword intent signals."""
    score = 0
    if lead.email and "@" in lead.email:
        score += 30
    if lead.phone and len("".join(c for c in lead.phone if c.isdigit())) >= 10:
        score += 30
    if lead.full_name and " " in lead.full_name.strip():
        score += 10

    text_blob = " ".join(lead.extra_fields.values()).lower()
    for keyword in profile.lead_scoring.hot_keywords:
        if keyword.lower() in text_blob:
            score += 15

    if profile.lead_scoring.require_phone and not lead.phone:
        score = min(score, 30)

    lead.score = min(score, 100)
    lead.grade = "A" if lead.score >= 70 else ("B" if lead.score >= 45 else "C")
    return lead


def collect_new_leads(profile: BusinessProfile, client: MetaClient,
                      state: StateStore) -> list[Lead]:
    all_raw: list[dict[str, Any]] = []
    for form_id in state["lead_forms"]:
        all_raw.extend(client.get_leads(form_id))

    fresh_ids = set(state.mark_leads_seen([r.get("id", "") for r in all_raw]))
    leads = [score_lead(parse_lead(r), profile) for r in all_raw if r.get("id") in fresh_ids]
    leads.sort(key=lambda l: l.score, reverse=True)
    state.save()
    return leads


def export_csv(leads: list[Lead], home: Path, profile_slug: str) -> Path:
    exports = Path(home) / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    path = exports / f"{profile_slug}-leads.csv"
    write_header = not path.exists()
    with path.open("a", newline="") as fh:
        writer = csv.writer(fh)
        if write_header:
            writer.writerow(["id", "created_time", "full_name", "email", "phone",
                             "score", "grade", "campaign_id", "adset_id", "extra"])
        for lead in leads:
            writer.writerow([
                lead.id, lead.created_time, lead.full_name, lead.email, lead.phone,
                lead.score, lead.grade, lead.campaign_id, lead.adset_id,
                json.dumps(lead.extra_fields) if lead.extra_fields else "",
            ])
    return path


def push_webhook(leads: list[Lead], settings: Settings, state: StateStore) -> int:
    """POST each lead as JSON; returns how many were delivered."""
    if not settings.lead_webhook_url:
        return 0
    delivered = 0
    for lead in leads:
        try:
            resp = requests.post(settings.lead_webhook_url, json=asdict(lead), timeout=30)
            if resp.ok:
                delivered += 1
            else:
                state.log_action("webhook_failed", lead_id=lead.id,
                                 status=resp.status_code)
        except requests.RequestException as exc:
            state.log_action("webhook_failed", lead_id=lead.id, error=str(exc))
    return delivered


def notify_slack(text: str, settings: Settings) -> None:
    if not settings.slack_webhook_url:
        return
    try:
        requests.post(settings.slack_webhook_url, json={"text": text}, timeout=15)
    except requests.RequestException:
        pass  # alerts are best-effort; never break the run over Slack
