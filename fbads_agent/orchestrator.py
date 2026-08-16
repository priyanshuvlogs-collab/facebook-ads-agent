"""Orchestrator: the agent loop that ties strategy, launch, optimization,
lead syncing and reporting together.

Typical lifecycle:

    agent = FacebookAdsAgent.from_files("profiles/my_business.yaml")
    agent.launch()          # once: plan + create + activate campaign
    agent.run_cycle()       # repeatedly (cron) or agent.run_forever(hours=6)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel

from . import leads as leads_mod
from . import optimizer as optimizer_mod
from . import reporter
from .campaign_builder import LaunchResult, launch as build_launch
from .copywriter import generate_copy
from .meta_client import MetaClient, build_client
from .profile import BusinessProfile, load_profile
from .settings import Settings
from .state import StateStore
from .strategy import CampaignPlan, build_plan

console = Console()


@dataclass
class CycleResult:
    metrics: dict[str, Any] = field(default_factory=dict)
    actions: list[optimizer_mod.Action] = field(default_factory=list)
    new_leads: int = 0
    report_path: Path | None = None


class FacebookAdsAgent:
    def __init__(self, profile: BusinessProfile, settings: Settings):
        self.profile = profile
        self.settings = settings
        self.state = StateStore(settings.agent_home, profile.slug)
        self.client: MetaClient = build_client(settings, self.state)

    @classmethod
    def from_files(cls, profile_path: str | Path, env_file: str | None = None) -> "FacebookAdsAgent":
        return cls(load_profile(profile_path), Settings.load(env_file))

    # ------------------------------------------------------------------ mode
    @property
    def mode(self) -> str:
        return "DRY-RUN (simulated)" if self.settings.effective_dry_run else "LIVE"

    def _mode_banner(self) -> None:
        style = "yellow" if self.settings.effective_dry_run else "bold red"
        console.print(Panel(
            f"Mode: [{style}]{self.mode}[/{style}]  |  Business: {self.profile.name}  |  "
            f"Industry: {self.profile.industry}  |  Budget: "
            f"{self.profile.budget.currency} {self.profile.budget.daily_budget:.2f}/day  |  "
            f"Target CPL: {self.profile.budget.max_cpl:.2f}",
            title="Facebook Ads Agent",
        ))

    # ------------------------------------------------------------------ plan
    def show_plan(self) -> CampaignPlan:
        self._mode_banner()
        plan = build_plan(self.profile)
        console.print(f"\n[bold]Campaign:[/bold] {plan.campaign_name}  "
                      f"([cyan]{plan.objective}[/cyan])")
        for ad_set in plan.ad_sets:
            budget = plan.daily_budget * ad_set.budget_share
            console.print(
                f"  - [bold]{ad_set.name}[/bold]  "
                f"{plan.currency} {budget:.2f}/day ({ad_set.budget_share * 100:.0f}%)"
            )
            if ad_set.interests:
                console.print(f"      interests: {', '.join(ad_set.interests[:6])}"
                              + (" ..." if len(ad_set.interests) > 6 else ""))
            console.print(f"      creative angles: {', '.join(ad_set.angles)}")
        for note in plan.notes:
            console.print(f"  [yellow]note:[/yellow] {note}")

        console.print("\n[bold]Ad copy preview[/bold] (angle: offer):")
        copy = generate_copy(self.profile, "offer", self.settings)
        console.print(Panel(
            f"[bold]{copy.headline}[/bold]\n\n{copy.primary_text}\n\n"
            f"[dim]{copy.description}[/dim]   [cyan][{copy.call_to_action}][/cyan]",
        ))
        return plan

    # ---------------------------------------------------------------- launch
    def launch(self, activate: bool = True) -> LaunchResult:
        self._mode_banner()
        if self.state["campaigns"]:
            console.print("[yellow]A campaign already exists in agent state; "
                          "launching an additional one.[/yellow]")
        plan = build_plan(self.profile)
        result = build_launch(self.profile, plan, self.client, self.settings,
                              self.state, activate=activate)
        console.print(f"\n[green]Launched[/green] campaign [bold]{result.campaign_id}[/bold] "
                      f"with {len(result.ad_set_ids)} ad set(s), "
                      f"{len(result.ad_ids)} ad(s), lead form {result.lead_form_id} "
                      f"({'ACTIVE' if activate else 'left PAUSED for review'}).")
        for detail in result.details:
            console.print(f"  - {detail['name']}: "
                          f"{self.profile.budget.currency} {detail['daily_budget']:.2f}/day, "
                          f"{len(detail['ads'])} ads")
        for note in plan.notes:
            console.print(f"  [yellow]note:[/yellow] {note}")
        return result

    # -------------------------------------------------------------- optimize
    def optimize(self) -> list[optimizer_mod.Action]:
        insights = self.client.get_insights("adset", date_preset="last_7d")
        reporter.print_insights_table(insights, self.profile)
        actions = optimizer_mod.evaluate(self.profile, insights, self.state)
        report = optimizer_mod.apply_actions(actions, self.client, self.state,
                                             self.profile.budget.currency)
        reporter.print_actions(report.actions)
        return report.actions

    # ------------------------------------------------------------ lead sync
    def sync_leads(self) -> list[leads_mod.Lead]:
        new_leads = leads_mod.collect_new_leads(self.profile, self.client, self.state)
        if new_leads:
            csv_path = leads_mod.export_csv(new_leads, self.settings.agent_home,
                                            self.profile.slug)
            delivered = leads_mod.push_webhook(new_leads, self.settings, self.state)
            console.print(f"[green]{len(new_leads)}[/green] new lead(s) -> "
                          f"CSV: {csv_path}"
                          + (f", webhook delivered: {delivered}" if delivered else ""))
        reporter.print_leads(new_leads)
        return new_leads

    # ------------------------------------------------------------ full cycle
    def run_cycle(self) -> CycleResult:
        """One full heartbeat: read performance, optimize spend, pull leads,
        write a report, and notify."""
        self._mode_banner()
        insights = self.client.get_insights("adset", date_preset="last_7d")
        metrics = reporter.kpis(insights)
        reporter.print_insights_table(insights, self.profile)

        actions = optimizer_mod.evaluate(self.profile, insights, self.state)
        opt_report = optimizer_mod.apply_actions(actions, self.client, self.state,
                                                 self.profile.budget.currency)
        reporter.print_actions(opt_report.actions)

        new_leads = self.sync_leads()

        digest = reporter.digest_text(self.profile, metrics, opt_report.actions,
                                      len(new_leads))
        leads_mod.notify_slack(digest, self.settings)

        report_path = reporter.save_report(self.settings.agent_home, self.profile.slug, {
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "mode": self.mode,
            "kpis": metrics,
            "actions": [vars(a) for a in opt_report.actions],
            "new_leads": len(new_leads),
            "insights": insights,
        })
        console.print(f"[dim]Report saved: {report_path}[/dim]")
        return CycleResult(metrics=metrics, actions=opt_report.actions,
                           new_leads=len(new_leads), report_path=report_path)

    def run_forever(self, interval_hours: float = 6.0) -> None:
        console.print(f"[bold]Agent running continuously[/bold] -- one cycle every "
                      f"{interval_hours:g}h. Ctrl+C to stop.")
        while True:
            try:
                self.run_cycle()
            except Exception as exc:
                console.print(f"[red]Cycle failed:[/red] {exc} -- retrying next interval.")
                self.state.log_action("cycle_error", error=str(exc))
                self.state.save()
            time.sleep(interval_hours * 3600)

    # ---------------------------------------------------------------- status
    def status(self) -> None:
        self._mode_banner()
        campaigns = self.state["campaigns"]
        ad_sets = self.state["ad_sets"]
        console.print(f"Campaigns: {len(campaigns)} | Ad sets: {len(ad_sets)} | "
                      f"Ads: {len(self.state['ads'])} | "
                      f"Leads seen: {len(self.state['seen_lead_ids'])}")
        for cid, meta in campaigns.items():
            console.print(f"  - {meta['name']} [{meta.get('status', '?')}] ({cid})")
        recent = self.state["action_log"][-8:]
        if recent:
            console.print("\n[bold]Recent agent actions:[/bold]")
            for entry in recent:
                console.print(f"  [dim]{entry['ts']}[/dim] {entry['action']} "
                              + (entry.get("reason", "") or entry.get("name", "") or ""))
