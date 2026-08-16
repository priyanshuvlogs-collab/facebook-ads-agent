import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fbads_agent.profile import profile_from_dict  # noqa: E402


@pytest.fixture
def sample_profile():
    return profile_from_dict({
        "business": {
            "name": "Acme Co",
            "industry": "dental",
            "website": "https://acme.example.com",
            "unique_selling_points": ["Fast", "Cheap", "Good"],
        },
        "offer": {"headline_offer": "free consult", "urgency": "This week only."},
        "targeting": {
            "countries": ["US"],
            "age_min": 25,
            "age_max": 55,
            "interests": ["Dentistry"],
        },
        "budget": {"daily_budget": 60.0, "currency": "USD", "max_cpl": 20.0},
        "lead_form": {"privacy_policy_url": "https://acme.example.com/privacy"},
        "lead_scoring": {"hot_keywords": ["implant"]},
    })
