from fbads_agent.profile import profile_from_dict
from fbads_agent.strategy import build_plan, resolve_industry


def test_industry_aliases():
    assert resolve_industry("Real Estate") == "real_estate"
    assert resolve_industry("gym") == "fitness"
    assert resolve_industry("b2b_saas") == "saas"
    assert resolve_industry("unknown_vertical") == "unknown_vertical"


def test_plan_structure(sample_profile):
    plan = build_plan(sample_profile)
    assert plan.objective == "OUTCOME_LEADS"
    kinds = [a.kind for a in plan.ad_sets]
    assert "prospecting" in kinds and "broad" in kinds
    assert "retargeting" not in kinds  # no custom audiences supplied
    assert abs(sum(a.budget_share for a in plan.ad_sets) - 1.0) < 1e-9


def test_retargeting_added_with_custom_audiences(sample_profile):
    sample_profile.targeting.custom_audience_ids = ["123"]
    plan = build_plan(sample_profile)
    assert any(a.kind == "retargeting" for a in plan.ad_sets)
    assert abs(sum(a.budget_share for a in plan.ad_sets) - 1.0) < 1e-9


def test_preset_interests_merged(sample_profile):
    plan = build_plan(sample_profile)
    prospecting = next(a for a in plan.ad_sets if a.kind == "prospecting")
    # user interest kept first, preset interests appended
    assert prospecting.interests[0] == "Dentistry"
    assert len(prospecting.interests) > 1


def test_unknown_industry_still_plans():
    profile = profile_from_dict({
        "business": {"name": "Weird Biz", "industry": "underwater_basket_weaving"},
        "budget": {"daily_budget": 30, "max_cpl": 10},
    })
    plan = build_plan(profile)
    # No interests known anywhere -> broad-only funnel
    assert [a.kind for a in plan.ad_sets] == ["broad"]
    assert abs(sum(a.budget_share for a in plan.ad_sets) - 1.0) < 1e-9
