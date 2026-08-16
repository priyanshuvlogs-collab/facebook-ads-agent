"""Optimizer: a transparent rules engine that manages spend like a media buyer.

Every cycle it reads ad-set insights and decides, per ad set:

* KILL   -- CPL blew past the kill threshold, or spend burned with zero leads
* SCALE  -- CPL is comfortably under target: raise budget stepwise
* TRIM   -- CPL is above target but not disastrous: cut budget stepwise
* HOLD   -- still learning or performing acceptably
* ALERT  -- creative fatigue (frequency) or weak CTR worth a human look

Each action carries a human-readable reason and is written to the action log,
so you can always answer "why did the agent do that?".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .meta_client import MetaClient, to_minor_units
from .profile import BusinessProfile
from .state import StateStore


@dataclass
class Action:
    kind: str            # kill | scale | trim | hold | alert
    ad_set_id: str
    ad_set_name: str
    reason: str
    old_budget: float | None = None
    new_budget: float | None = None
    applied: bool = False


@dataclass
class OptimizationReport:
    actions: list[Action] = field(default_factory=list)

    @property
    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in self.actions:
            counts[a.kind] = counts.get(a.kind, 0) + 1
        return counts


def evaluate(profile: BusinessProfile, insights: list[dict[str, Any]],
             state: StateStore) -> list[Action]:
    """Pure decision function: insights in, actions out. No side effects."""
    policy = profile.optimization
    max_cpl = profile.budget.max_cpl
    kill_cpl = max_cpl * policy.kill_multiplier
    scale_cpl = max_cpl * policy.scale_trigger

    actions: list[Action] = []
    for row in insights:
        ad_set_id = row.get("adset_id", "")
        name = row.get("adset_name", ad_set_id)
        spend = float(row.get("spend", 0) or 0)
        leads = int(row.get("leads", 0) or 0)
        cpl = row.get("cost_per_lead")
        ctr = float(row.get("ctr", 0) or 0)
        frequency = float(row.get("frequency", 0) or 0)
        budget = _current_budget(state, ad_set_id)

        # --- Zero-lead burn guard (works even before min lead volume) -------
        if leads == 0:
            if spend >= kill_cpl:
                actions.append(Action(
                    "kill", ad_set_id, name,
                    f"Spent {spend:.2f} with 0 leads (kill threshold {kill_cpl:.2f}).",
                ))
            else:
                actions.append(Action(
                    "hold", ad_set_id, name,
                    f"0 leads so far but spend ({spend:.2f}) below kill threshold; still learning.",
                ))
            continue

        # --- Learning phase: not enough data to judge -----------------------
        if leads < policy.min_leads_before_judgement:
            actions.append(Action(
                "hold", ad_set_id, name,
                f"Only {leads} lead(s) (< {policy.min_leads_before_judgement}); letting it learn.",
            ))
            continue

        cpl = float(cpl if cpl is not None else spend / leads)

        # --- Kill rule -------------------------------------------------------
        if cpl > kill_cpl:
            actions.append(Action(
                "kill", ad_set_id, name,
                f"CPL {cpl:.2f} > kill threshold {kill_cpl:.2f} "
                f"({policy.kill_multiplier}x max CPL {max_cpl:.2f}).",
            ))
            continue

        # --- Scale rule --------------------------------------------------------
        if cpl < scale_cpl and budget is not None:
            new_budget = min(
                round(budget * (1 + policy.scale_step_pct / 100), 2),
                policy.max_daily_budget,
            )
            if new_budget > budget:
                actions.append(Action(
                    "scale", ad_set_id, name,
                    f"CPL {cpl:.2f} beats target {max_cpl:.2f} by "
                    f"{(1 - cpl / max_cpl) * 100:.0f}%; raising budget "
                    f"{policy.scale_step_pct:.0f}% (cap {policy.max_daily_budget:.2f}).",
                    old_budget=budget, new_budget=new_budget,
                ))
            else:
                actions.append(Action(
                    "hold", ad_set_id, name,
                    f"CPL {cpl:.2f} is great but budget already at cap "
                    f"{policy.max_daily_budget:.2f}.",
                ))
        # --- Trim rule -----------------------------------------------------------
        elif cpl > max_cpl and budget is not None:
            new_budget = max(round(budget * (1 - policy.scale_step_pct / 100), 2), 1.0)
            actions.append(Action(
                "trim", ad_set_id, name,
                f"CPL {cpl:.2f} above target {max_cpl:.2f} but under kill threshold; "
                f"trimming budget {policy.scale_step_pct:.0f}%.",
                old_budget=budget, new_budget=new_budget,
            ))
        else:
            actions.append(Action(
                "hold", ad_set_id, name,
                f"CPL {cpl:.2f} within acceptable range (target {max_cpl:.2f}).",
            ))

        # --- Advisory alerts (non-blocking) ---------------------------------
        if frequency > policy.frequency_cap:
            actions.append(Action(
                "alert", ad_set_id, name,
                f"Frequency {frequency:.1f} exceeds {policy.frequency_cap:.1f}: audience "
                f"fatigue -- refresh creatives or expand the audience.",
            ))
        if ctr and ctr < policy.min_ctr_pct:
            actions.append(Action(
                "alert", ad_set_id, name,
                f"CTR {ctr:.2f}% below {policy.min_ctr_pct:.2f}%: creatives aren't "
                f"resonating -- consider new hooks/images.",
            ))

    return actions


def apply_actions(actions: list[Action], client: MetaClient, state: StateStore,
                  currency: str) -> OptimizationReport:
    """Execute kill/scale/trim decisions against the API and log everything."""
    for action in actions:
        try:
            if action.kind == "kill":
                client.set_status(action.ad_set_id, "PAUSED")
                action.applied = True
            elif action.kind in {"scale", "trim"} and action.new_budget:
                client.update_ad_set_budget(
                    action.ad_set_id, to_minor_units(action.new_budget, currency)
                )
                _remember_budget(state, action.ad_set_id, action.new_budget)
                action.applied = True
            state.log_action(
                f"optimizer_{action.kind}",
                ad_set_id=action.ad_set_id,
                reason=action.reason,
                old_budget=action.old_budget,
                new_budget=action.new_budget,
                applied=action.applied,
            )
        except Exception as exc:  # keep optimizing the rest even if one call fails
            state.log_action("optimizer_error", ad_set_id=action.ad_set_id, error=str(exc))
    state.save()
    return OptimizationReport(actions=actions)


def _current_budget(state: StateStore, ad_set_id: str) -> float | None:
    meta = state["ad_sets"].get(ad_set_id)
    if meta and meta.get("daily_budget_minor"):
        return meta["daily_budget_minor"] / 100
    return None


def _remember_budget(state: StateStore, ad_set_id: str, budget: float) -> None:
    if ad_set_id in state["ad_sets"]:
        state["ad_sets"][ad_set_id]["daily_budget_minor"] = int(round(budget * 100))
