"""Meta (Facebook) Marketing API client.

Two interchangeable implementations behind one interface:

* ``LiveMetaClient``  -- real Graph API calls with retries and clear errors.
* ``DryRunMetaClient`` -- a deterministic local simulator that fabricates ids,
  insights and leads so the entire agent loop can run with zero credentials.

The rest of the codebase only talks to ``MetaClient``.
"""

from __future__ import annotations

import hashlib
import random
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any

import requests

from .settings import Settings
from .state import StateStore

GRAPH_URL = "https://graph.facebook.com"

# Meta expects budgets in minor units (cents) for most currencies.
ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "VND", "CLP", "ISK", "PYG", "TWD", "HUF", "COP"}


def to_minor_units(amount: float, currency: str) -> int:
    if currency.upper() in ZERO_DECIMAL_CURRENCIES:
        return int(round(amount))
    return int(round(amount * 100))


class MetaAPIError(RuntimeError):
    def __init__(self, message: str, code: int | None = None, subcode: int | None = None):
        super().__init__(message)
        self.code = code
        self.subcode = subcode


class MetaClient(ABC):
    """Interface used by the strategy/builder/optimizer layers."""

    # -- entity creation ---------------------------------------------------
    @abstractmethod
    def create_campaign(self, name: str, objective: str, daily_budget_minor: int | None,
                        status: str = "PAUSED") -> str: ...

    @abstractmethod
    def create_lead_form(self, name: str, questions: list[dict[str, Any]],
                         privacy_policy_url: str, thank_you: dict[str, Any]) -> str: ...

    @abstractmethod
    def create_ad_set(self, campaign_id: str, name: str, daily_budget_minor: int | None,
                      targeting: dict[str, Any], optimization_goal: str,
                      promoted_object: dict[str, Any], status: str = "PAUSED") -> str: ...

    @abstractmethod
    def create_ad_creative(self, name: str, page_id: str, message: str, headline: str,
                           description: str, link: str, image_url: str | None,
                           call_to_action: str, lead_form_id: str | None) -> str: ...

    @abstractmethod
    def create_ad(self, ad_set_id: str, name: str, creative_id: str,
                  status: str = "PAUSED") -> str: ...

    # -- mutation ------------------------------------------------------------
    @abstractmethod
    def set_status(self, entity_id: str, status: str) -> None: ...

    @abstractmethod
    def update_ad_set_budget(self, ad_set_id: str, daily_budget_minor: int) -> None: ...

    # -- reads ---------------------------------------------------------------
    @abstractmethod
    def get_insights(self, level: str, date_preset: str = "last_7d") -> list[dict[str, Any]]: ...

    @abstractmethod
    def get_leads(self, form_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    def search_interests(self, query: str, limit: int = 10) -> list[dict[str, Any]]: ...


# ---------------------------------------------------------------------------
# Live implementation
# ---------------------------------------------------------------------------

class LiveMetaClient(MetaClient):
    RETRYABLE_CODES = {1, 2, 4, 17, 32, 613}  # transient / rate-limit error codes

    def __init__(self, settings: Settings):
        if not settings.has_meta_credentials:
            raise MetaAPIError(
                "Live mode requires META_ACCESS_TOKEN, META_AD_ACCOUNT_ID and META_PAGE_ID"
            )
        self.settings = settings
        self.session = requests.Session()

    # -- low-level ---------------------------------------------------------
    def _url(self, path: str) -> str:
        return f"{GRAPH_URL}/{self.settings.api_version}/{path.lstrip('/')}"

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None,
                 json_body: dict[str, Any] | None = None, max_retries: int = 4) -> dict[str, Any]:
        params = dict(params or {})
        params["access_token"] = self.settings.access_token
        delay = 2.0
        for attempt in range(max_retries + 1):
            resp = self.session.request(method, self._url(path), params=params,
                                        json=json_body, timeout=60)
            if resp.ok:
                return resp.json()
            try:
                err = resp.json().get("error", {})
            except ValueError:
                err = {}
            code = err.get("code")
            if code in self.RETRYABLE_CODES and attempt < max_retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise MetaAPIError(
                f"Graph API {method} {path} failed: "
                f"{err.get('message', resp.text[:300])}",
                code=code, subcode=err.get("error_subcode"),
            )
        raise MetaAPIError(f"Graph API {method} {path}: retries exhausted")

    @property
    def _account(self) -> str:
        acct = self.settings.ad_account_id
        return acct if acct.startswith("act_") else f"act_{acct}"

    # -- entity creation ---------------------------------------------------
    def create_campaign(self, name, objective, daily_budget_minor, status="PAUSED"):
        body: dict[str, Any] = {
            "name": name,
            "objective": objective,
            "status": status,
            "special_ad_categories": [],
        }
        if daily_budget_minor:
            body["daily_budget"] = daily_budget_minor
            body["bid_strategy"] = "LOWEST_COST_WITHOUT_CAP"
        return self._request("POST", f"{self._account}/campaigns", json_body=body)["id"]

    def create_lead_form(self, name, questions, privacy_policy_url, thank_you):
        body = {
            "name": name,
            "questions": questions,
            "privacy_policy": {"url": privacy_policy_url},
            "thank_you_page": thank_you,
        }
        return self._request("POST", f"{self.settings.page_id}/leadgen_forms", json_body=body)["id"]

    def create_ad_set(self, campaign_id, name, daily_budget_minor, targeting,
                      optimization_goal, promoted_object, status="PAUSED"):
        body: dict[str, Any] = {
            "name": name,
            "campaign_id": campaign_id,
            "billing_event": "IMPRESSIONS",
            "optimization_goal": optimization_goal,
            "targeting": targeting,
            "promoted_object": promoted_object,
            "status": status,
        }
        if daily_budget_minor:
            body["daily_budget"] = daily_budget_minor
        return self._request("POST", f"{self._account}/adsets", json_body=body)["id"]

    def create_ad_creative(self, name, page_id, message, headline, description,
                           link, image_url, call_to_action, lead_form_id):
        cta: dict[str, Any] = {"type": call_to_action}
        if lead_form_id:
            cta["value"] = {"lead_gen_form_id": lead_form_id}
        link_data: dict[str, Any] = {
            "message": message,
            "name": headline,
            "description": description,
            "link": link or "https://fb.me/",
            "call_to_action": cta,
        }
        if image_url:
            link_data["picture"] = image_url
        body = {
            "name": name,
            "object_story_spec": {"page_id": page_id, "link_data": link_data},
        }
        return self._request("POST", f"{self._account}/adcreatives", json_body=body)["id"]

    def create_ad(self, ad_set_id, name, creative_id, status="PAUSED"):
        body = {
            "name": name,
            "adset_id": ad_set_id,
            "creative": {"creative_id": creative_id},
            "status": status,
        }
        return self._request("POST", f"{self._account}/ads", json_body=body)["id"]

    # -- mutation ------------------------------------------------------------
    def set_status(self, entity_id, status):
        self._request("POST", entity_id, json_body={"status": status})

    def update_ad_set_budget(self, ad_set_id, daily_budget_minor):
        self._request("POST", ad_set_id, json_body={"daily_budget": daily_budget_minor})

    # -- reads ---------------------------------------------------------------
    def get_insights(self, level, date_preset="last_7d"):
        params = {
            "level": level,
            "date_preset": date_preset,
            "fields": ",".join([
                "campaign_id", "campaign_name", "adset_id", "adset_name",
                "ad_id", "ad_name", "spend", "impressions", "clicks", "ctr",
                "cpm", "frequency", "actions", "cost_per_action_type",
            ]),
        }
        data = self._request("GET", f"{self._account}/insights", params=params)
        rows = data.get("data", [])
        for row in rows:
            row["leads"] = _extract_action(row, "lead")
            row["cost_per_lead"] = _extract_cost(row, "lead")
        return rows

    def get_leads(self, form_id):
        params = {"fields": "id,created_time,field_data,ad_id,adset_id,campaign_id"}
        leads: list[dict[str, Any]] = []
        path = f"{form_id}/leads"
        while path:
            data = self._request("GET", path, params=params)
            leads.extend(data.get("data", []))
            next_url = data.get("paging", {}).get("next")
            if not next_url:
                break
            path = next_url.replace(f"{GRAPH_URL}/{self.settings.api_version}/", "")
            params = {}
        return leads

    def search_interests(self, query, limit=10):
        params = {"type": "adinterest", "q": query, "limit": limit}
        return self._request("GET", "search", params=params).get("data", [])


def _extract_action(row: dict[str, Any], action_type: str) -> int:
    for action in row.get("actions", []) or []:
        if action.get("action_type") == action_type:
            return int(float(action.get("value", 0)))
    return 0


def _extract_cost(row: dict[str, Any], action_type: str) -> float | None:
    for action in row.get("cost_per_action_type", []) or []:
        if action.get("action_type") == action_type:
            return float(action.get("value", 0))
    return None


# ---------------------------------------------------------------------------
# Dry-run simulator
# ---------------------------------------------------------------------------

FIRST_NAMES = ["Ava", "Liam", "Maya", "Noah", "Zoe", "Ethan", "Ivy", "Lucas",
               "Nina", "Owen", "Priya", "Diego", "Sofia", "Jamal", "Elena", "Kai"]
LAST_NAMES = ["Nguyen", "Garcia", "Smith", "Patel", "Kim", "Johnson", "Silva",
              "Chen", "Okafor", "Brown", "Rossi", "Khan", "Lopez", "Martin"]


class DryRunMetaClient(MetaClient):
    """Deterministic simulator: every entity gets an id, and insights/leads are
    synthesized with per-entity 'true' performance so the optimizer has real
    signal to act on. Randomness is seeded from entity ids => reproducible.
    """

    def __init__(self, state: StateStore):
        self.state = state
        self.state["sim"] = self.state.get("sim") or {}

    def _new_id(self, prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    def _seed_rng(self, entity_id: str) -> random.Random:
        seed = int(hashlib.sha256(entity_id.encode()).hexdigest()[:8], 16)
        return random.Random(seed)

    # -- entity creation ---------------------------------------------------
    def create_campaign(self, name, objective, daily_budget_minor, status="PAUSED"):
        cid = self._new_id("cmp")
        self.state.register("campaigns", cid, {
            "name": name, "objective": objective, "status": status,
            "daily_budget_minor": daily_budget_minor,
        })
        return cid

    def create_lead_form(self, name, questions, privacy_policy_url, thank_you):
        fid = self._new_id("form")
        self.state.register("lead_forms", fid, {"name": name, "questions": questions})
        return fid

    def create_ad_set(self, campaign_id, name, daily_budget_minor, targeting,
                      optimization_goal, promoted_object, status="PAUSED"):
        aid = self._new_id("adset")
        # Assign a hidden "true CPL multiplier" so some ad sets are winners
        # and some are losers -- gives the optimizer something to optimize.
        rng = self._seed_rng(aid)
        self.state.register("ad_sets", aid, {
            "name": name, "campaign_id": campaign_id, "status": status,
            "daily_budget_minor": daily_budget_minor, "targeting": targeting,
            "true_cpl_multiplier": round(rng.uniform(0.4, 2.2), 2),
            "true_ctr": round(rng.uniform(0.4, 2.5), 2),
        })
        return aid

    def create_ad_creative(self, name, page_id, message, headline, description,
                           link, image_url, call_to_action, lead_form_id):
        crid = self._new_id("cr")
        self.state.register("sim", crid, {"kind": "creative", "headline": headline})
        return crid

    def create_ad(self, ad_set_id, name, creative_id, status="PAUSED"):
        adid = self._new_id("ad")
        self.state.register("ads", adid, {
            "name": name, "ad_set_id": ad_set_id,
            "creative_id": creative_id, "status": status,
        })
        return adid

    # -- mutation ------------------------------------------------------------
    def set_status(self, entity_id, status):
        for kind in ("campaigns", "ad_sets", "ads"):
            if entity_id in self.state[kind]:
                self.state[kind][entity_id]["status"] = status
                return
        raise MetaAPIError(f"Unknown entity in dry-run state: {entity_id}")

    def update_ad_set_budget(self, ad_set_id, daily_budget_minor):
        if ad_set_id not in self.state["ad_sets"]:
            raise MetaAPIError(f"Unknown ad set: {ad_set_id}")
        self.state["ad_sets"][ad_set_id]["daily_budget_minor"] = daily_budget_minor

    # -- reads ---------------------------------------------------------------
    def get_insights(self, level, date_preset="last_7d"):
        rows = []
        for aid, meta in self.state["ad_sets"].items():
            if meta.get("status") != "ACTIVE":
                continue
            budget = (meta.get("daily_budget_minor") or 2000) / 100
            days = 7 if "7" in date_preset else 1
            spend = round(budget * days * random.Random(aid + date_preset).uniform(0.85, 1.0), 2)
            base_cpl = 20.0 * meta.get("true_cpl_multiplier", 1.0)
            leads = int(spend / base_cpl) if base_cpl > 0 else 0
            ctr = meta.get("true_ctr", 1.0)
            impressions = int(spend / 8.0 * 1000)  # ~$8 CPM
            clicks = int(impressions * ctr / 100)
            campaign = self.state["campaigns"].get(meta["campaign_id"], {})
            rows.append({
                "campaign_id": meta["campaign_id"],
                "campaign_name": campaign.get("name", ""),
                "adset_id": aid,
                "adset_name": meta["name"],
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "ctr": ctr,
                "cpm": 8.0,
                "frequency": round(random.Random(aid).uniform(1.1, 5.0), 2),
                "leads": leads,
                "cost_per_lead": round(spend / leads, 2) if leads else None,
            })
        if level == "campaign":
            return _rollup_by_campaign(rows)
        return rows

    def get_leads(self, form_id):
        """Fabricate leads proportional to active ad set performance."""
        leads: list[dict[str, Any]] = []
        for row in self.get_insights("adset", date_preset="last_1d"):
            rng = self._seed_rng(row["adset_id"] + time.strftime("%Y%m%d"))
            for i in range(row["leads"]):
                first = rng.choice(FIRST_NAMES)
                last = rng.choice(LAST_NAMES)
                leads.append({
                    "id": f"lead_{hashlib.sha256(f'{row['adset_id']}{i}{time.strftime('%Y%m%d')}'.encode()).hexdigest()[:12]}",
                    "created_time": time.strftime("%Y-%m-%dT%H:%M:%S+0000"),
                    "adset_id": row["adset_id"],
                    "campaign_id": row["campaign_id"],
                    "field_data": [
                        {"name": "full_name", "values": [f"{first} {last}"]},
                        {"name": "email", "values": [f"{first.lower()}.{last.lower()}@example.com"]},
                        {"name": "phone_number", "values": [f"+1555{rng.randint(1000000, 9999999)}"]},
                    ],
                })
        return leads

    def search_interests(self, query, limit=10):
        rng = self._seed_rng(query)
        return [
            {"id": str(rng.randint(6002000000000, 6004000000000)), "name": query.title(),
             "audience_size_lower_bound": rng.randint(500_000, 50_000_000)}
        ]


def _rollup_by_campaign(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_campaign: dict[str, dict[str, Any]] = {}
    for row in rows:
        agg = by_campaign.setdefault(row["campaign_id"], {
            "campaign_id": row["campaign_id"], "campaign_name": row["campaign_name"],
            "spend": 0.0, "impressions": 0, "clicks": 0, "leads": 0,
        })
        agg["spend"] = round(agg["spend"] + row["spend"], 2)
        agg["impressions"] += row["impressions"]
        agg["clicks"] += row["clicks"]
        agg["leads"] += row["leads"]
    for agg in by_campaign.values():
        agg["ctr"] = round(agg["clicks"] / agg["impressions"] * 100, 2) if agg["impressions"] else 0
        agg["cost_per_lead"] = round(agg["spend"] / agg["leads"], 2) if agg["leads"] else None
    return list(by_campaign.values())


def build_client(settings: Settings, state: StateStore) -> MetaClient:
    if settings.effective_dry_run:
        return DryRunMetaClient(state)
    return LiveMetaClient(settings)
