import pytest

from fbads_agent.optimizer import evaluate
from fbads_agent.state import StateStore


@pytest.fixture
def state(tmp_path):
    s = StateStore(tmp_path, "test")
    s["ad_sets"] = {
        "as_winner": {"name": "Winner", "daily_budget_minor": 3000, "status": "ACTIVE"},
        "as_loser": {"name": "Loser", "daily_budget_minor": 3000, "status": "ACTIVE"},
        "as_meh": {"name": "Meh", "daily_budget_minor": 3000, "status": "ACTIVE"},
        "as_new": {"name": "New", "daily_budget_minor": 3000, "status": "ACTIVE"},
        "as_burn": {"name": "Burner", "daily_budget_minor": 3000, "status": "ACTIVE"},
    }
    return s


def _row(adset_id, name, spend, leads, ctr=1.2, frequency=2.0):
    return {
        "adset_id": adset_id, "adset_name": name, "spend": spend, "leads": leads,
        "cost_per_lead": round(spend / leads, 2) if leads else None,
        "ctr": ctr, "frequency": frequency,
    }


def test_rules(sample_profile, state):
    # max_cpl=20, kill=30 (1.5x), scale under 14 (0.7x), min leads 5
    insights = [
        _row("as_winner", "Winner", spend=100, leads=10),   # CPL 10 -> scale
        _row("as_loser", "Loser", spend=200, leads=6),      # CPL 33 -> kill
        _row("as_meh", "Meh", spend=150, leads=6),          # CPL 25 -> trim
        _row("as_new", "New", spend=20, leads=2),           # learning -> hold
        _row("as_burn", "Burner", spend=45, leads=0),       # 0 leads, spend > kill -> kill
    ]
    actions = {a.ad_set_id: a for a in evaluate(sample_profile, insights, state)
               if a.kind != "alert"}
    assert actions["as_winner"].kind == "scale"
    assert actions["as_winner"].new_budget == 36.0  # 30 * 1.2
    assert actions["as_loser"].kind == "kill"
    assert actions["as_meh"].kind == "trim"
    assert actions["as_meh"].new_budget == 24.0  # 30 * 0.8
    assert actions["as_new"].kind == "hold"
    assert actions["as_burn"].kind == "kill"


def test_scale_respects_budget_cap(sample_profile, state):
    sample_profile.optimization.max_daily_budget = 30.0  # already at cap
    insights = [_row("as_winner", "Winner", spend=100, leads=10)]
    (action,) = [a for a in evaluate(sample_profile, insights, state) if a.kind != "alert"]
    assert action.kind == "hold"
    assert "cap" in action.reason


def test_fatigue_and_ctr_alerts(sample_profile, state):
    insights = [_row("as_winner", "Winner", spend=100, leads=10,
                     ctr=0.2, frequency=6.0)]
    alerts = [a for a in evaluate(sample_profile, insights, state) if a.kind == "alert"]
    reasons = " ".join(a.reason for a in alerts)
    assert "Frequency" in reasons and "CTR" in reasons


def test_zero_leads_low_spend_holds(sample_profile, state):
    insights = [_row("as_new", "New", spend=10, leads=0)]
    (action,) = evaluate(sample_profile, insights, state)
    assert action.kind == "hold"
