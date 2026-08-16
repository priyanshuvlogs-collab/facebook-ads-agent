"""Reporter: KPIs, tables and daily digests from insights + agent activity."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table

from .leads import Lead
from .optimizer import Action
from .profile import BusinessProfile

console = Console()


def kpis(insights: list[dict[str, Any]]) -> dict[str, Any]:
    spend = sum(float(r.get("spend", 0) or 0) for r in insights)
    leads = sum(int(r.get("leads", 0) or 0) for r in insights)
    impressions = sum(int(r.get("impressions", 0) or 0) for r in insights)
    clicks = sum(int(r.get("clicks", 0) or 0) for r in insights)
    return {
        "spend": round(spend, 2),
        "leads": leads,
        "cost_per_lead": round(spend / leads, 2) if leads else None,
        "impressions": impressions,
        "clicks": clicks,
        "ctr_pct": round(clicks / impressions * 100, 2) if impressions else 0.0,
    }


def print_insights_table(insights: list[dict[str, Any]], profile: BusinessProfile) -> None:
    table = Table(title=f"Ad set performance -- {profile.name}", show_lines=False)
    for col in ["Ad set", "Spend", "Leads", "CPL", "CTR %", "Freq"]:
        table.add_column(col)
    max_cpl = profile.budget.max_cpl
    for row in insights:
        cpl = row.get("cost_per_lead")
        cpl_str = f"{cpl:.2f}" if cpl is not None else "-"
        style = None
        if cpl is not None:
            style = "green" if cpl <= max_cpl else "red"
        table.add_row(
            row.get("adset_name", row.get("adset_id", "?")),
            f"{float(row.get('spend', 0)):.2f}",
            str(row.get("leads", 0)),
            cpl_str,
            f"{float(row.get('ctr', 0)):.2f}",
            f"{float(row.get('frequency', 0)):.1f}",
            style=style,
        )
    console.print(table)


def print_actions(actions: list[Action]) -> None:
    if not actions:
        console.print("[dim]No optimization actions this cycle.[/dim]")
        return
    table = Table(title="Optimizer decisions")
    for col in ["Action", "Ad set", "Budget", "Reason"]:
        table.add_column(col, overflow="fold")
    styles = {"kill": "red", "scale": "green", "trim": "yellow",
              "hold": "dim", "alert": "magenta"}
    for a in actions:
        budget = ""
        if a.old_budget is not None and a.new_budget is not None:
            budget = f"{a.old_budget:.2f} -> {a.new_budget:.2f}"
        table.add_row(a.kind.upper(), a.ad_set_name, budget, a.reason,
                      style=styles.get(a.kind))
    console.print(table)


def print_leads(leads: list[Lead], limit: int = 10) -> None:
    if not leads:
        console.print("[dim]No new leads this cycle.[/dim]")
        return
    table = Table(title=f"New leads ({len(leads)})")
    for col in ["Grade", "Score", "Name", "Email", "Phone"]:
        table.add_column(col)
    for lead in leads[:limit]:
        style = {"A": "green", "B": "yellow"}.get(lead.grade, "dim")
        table.add_row(lead.grade, str(lead.score), lead.full_name,
                      lead.email, lead.phone, style=style)
    if len(leads) > limit:
        console.print(f"[dim]... and {len(leads) - limit} more (see CSV export).[/dim]")
    console.print(table)


def digest_text(profile: BusinessProfile, metrics: dict[str, Any],
                actions: list[Action], new_leads: int) -> str:
    cpl = metrics["cost_per_lead"]
    lines = [
        f"*{profile.name}* -- Facebook Ads agent digest",
        f"Spend: {profile.budget.currency} {metrics['spend']:.2f} | "
        f"Leads: {metrics['leads']} | CPL: "
        f"{f'{cpl:.2f}' if cpl is not None else 'n/a'} "
        f"(target <= {profile.budget.max_cpl:.2f}) | CTR: {metrics['ctr_pct']:.2f}%",
        f"New leads this cycle: {new_leads}",
    ]
    interesting = [a for a in actions if a.kind != "hold"]
    if interesting:
        lines.append("Actions taken:")
        lines += [f"- {a.kind.upper()}: {a.ad_set_name} -- {a.reason}" for a in interesting]
    else:
        lines.append("No changes needed -- everything within targets.")
    return "\n".join(lines)


def save_report(home: Path, profile_slug: str, payload: dict[str, Any]) -> Path:
    reports = Path(home) / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    path = reports / f"{profile_slug}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    path.write_text(json.dumps(payload, indent=2, default=str))
    return path
