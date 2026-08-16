from pathlib import Path

import pytest

from fbads_agent.profile import ProfileError, load_profile, profile_from_dict

PROFILES_DIR = Path(__file__).resolve().parent.parent / "profiles"


@pytest.mark.parametrize("path", sorted(PROFILES_DIR.glob("*.yaml")))
def test_all_bundled_profiles_load(path):
    profile = load_profile(path)
    assert profile.name
    assert profile.budget.daily_budget > 0
    assert profile.budget.max_cpl > 0


def test_missing_name_rejected():
    with pytest.raises(ProfileError, match="business.name"):
        profile_from_dict({"business": {"industry": "dental"},
                           "budget": {"daily_budget": 10, "max_cpl": 5}})


def test_missing_budget_rejected():
    with pytest.raises(ProfileError, match="daily_budget"):
        profile_from_dict({"business": {"name": "X", "industry": "dental"}})


def test_underage_targeting_rejected():
    with pytest.raises(ProfileError, match="age_min"):
        profile_from_dict({
            "business": {"name": "X", "industry": "dental"},
            "targeting": {"age_min": 16},
            "budget": {"daily_budget": 10, "max_cpl": 5},
        })


def test_slug(sample_profile):
    assert sample_profile.slug == "acme-co"
