"""Strategy engine: turns a business profile into a concrete campaign plan.

The plan implements a proven lead-gen funnel structure:

1. PROSPECTING  -- interest-stacked cold audiences (most budget)
2. BROAD        -- no interest targeting; lets Meta's delivery AI hunt (Advantage+)
3. RETARGETING  -- warm custom audiences, only when the profile provides them

Each ad set carries multiple creative angles so the platform (and later the
optimizer) can find the message that converts cheapest.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .profile import BusinessProfile

# Creative angles every business benefits from testing against each other.
ANGLES = ["pain_point", "offer", "social_proof"]


@dataclass
class AdSetPlan:
    name: str
    kind: str                      # prospecting | broad | retargeting
    budget_share: float            # fraction of daily budget
    interests: list[str] = field(default_factory=list)
    use_custom_audiences: bool = False
    angles: list[str] = field(default_factory=lambda: list(ANGLES))


@dataclass
class CampaignPlan:
    campaign_name: str
    objective: str
    daily_budget: float
    currency: str
    ad_sets: list[AdSetPlan] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# Industry presets: seed interests and extra strategy notes. The agent works
# for ANY industry -- unknown ones fall back to profile interests + broad.
INDUSTRY_PRESETS: dict[str, dict[str, Any]] = {
    "real_estate": {
        "interests": ["Real estate", "Zillow", "Mortgage loan", "First-time buyer"],
        "notes": ["Housing audiences may fall under Special Ad Categories in some regions -- verify in Ads Manager before scaling."],
    },
    "dental": {
        "interests": ["Dentistry", "Cosmetic dentistry", "Oral hygiene", "Teeth whitening"],
        "notes": ["Local radius targeting outperforms broad city targeting for clinics."],
    },
    "fitness": {
        "interests": ["Physical fitness", "Gym", "Weight loss", "Personal trainer"],
        "notes": ["Transformation-style social proof angles historically win in fitness."],
    },
    "saas": {
        "interests": ["Software as a service", "Small business", "Entrepreneurship", "Marketing automation"],
        "notes": ["Lead magnets (free tools/templates) beat direct demo asks for cold traffic."],
    },
    "ecommerce": {
        "interests": ["Online shopping", "Discount stores", "Fashion accessories"],
        "notes": ["Consider pairing lead-gen (email capture w/ discount) with catalog sales campaigns."],
    },
    "legal": {
        "interests": ["Lawyer", "Personal injury", "Legal advice"],
        "notes": ["High CPCs are normal; judge on cost-per-qualified-lead, not CPL alone."],
    },
    "home_services": {
        "interests": ["Home improvement", "Renovation", "Plumbing", "HVAC"],
        "notes": ["Urgency angles ('same-day service') tend to lift conversion rates."],
    },
    "education": {
        "interests": ["Online learning", "Professional certification", "Higher education"],
        "notes": ["Education can be a Special Ad Category in some regions -- verify before launch."],
    },
    "automotive": {
        "interests": ["Cars", "Auto show", "Vehicle leasing", "Used cars"],
        "notes": [],
    },
    "insurance": {
        "interests": ["Insurance", "Life insurance", "Financial planning"],
        "notes": ["Financial products may require Special Ad Category handling."],
    },
}

# Loose aliases so users can write natural industry names in their profile.
INDUSTRY_ALIASES = {
    "realestate": "real_estate", "real estate": "real_estate", "realtor": "real_estate",
    "property": "real_estate",
    "dentist": "dental", "dental_clinic": "dental", "dentistry": "dental",
    "gym": "fitness", "fitness_gym": "fitness", "personal_training": "fitness",
    "wellness": "fitness",
    "software": "saas", "b2b_saas": "saas", "b2b": "saas", "tech": "saas",
    "e-commerce": "ecommerce", "ecom": "ecommerce", "online_store": "ecommerce",
    "retail": "ecommerce", "shop": "ecommerce",
    "law": "legal", "attorney": "legal", "law_firm": "legal",
    "plumber": "home_services", "hvac": "home_services", "contractor": "home_services",
    "roofing": "home_services", "cleaning": "home_services", "landscaping": "home_services",
    "school": "education", "course": "education", "coaching": "education",
    "car_dealership": "automotive", "auto": "automotive", "dealership": "automotive",
}


def resolve_industry(industry: str) -> str:
    key = industry.lower().strip().replace("-", "_")
    if key in INDUSTRY_PRESETS:
        return key
    return INDUSTRY_ALIASES.get(key, INDUSTRY_ALIASES.get(key.replace("_", " "), key))


def build_plan(profile: BusinessProfile) -> CampaignPlan:
    industry = resolve_industry(profile.industry)
    preset = INDUSTRY_PRESETS.get(industry, {})

    # Merge preset interests with user-provided ones (user's first, deduped).
    interests: list[str] = []
    for name in [*profile.targeting.interests, *preset.get("interests", [])]:
        if name.lower() not in {i.lower() for i in interests}:
            interests.append(name)

    has_warm = bool(profile.targeting.custom_audience_ids)

    # Budget split: retargeting slice only exists when warm audiences exist.
    if has_warm:
        splits = {"prospecting": 0.55, "broad": 0.25, "retargeting": 0.20}
    else:
        splits = {"prospecting": 0.65, "broad": 0.35}

    ad_sets: list[AdSetPlan] = []
    if interests:
        ad_sets.append(AdSetPlan(
            name="Prospecting | Interest stack",
            kind="prospecting",
            budget_share=splits["prospecting"],
            interests=interests[:10],
        ))
    else:
        # No interests known at all: give the prospecting share to broad.
        splits["broad"] += splits.pop("prospecting")

    ad_sets.append(AdSetPlan(
        name="Broad | Advantage audience",
        kind="broad",
        budget_share=splits["broad"],
    ))

    if has_warm:
        ad_sets.append(AdSetPlan(
            name="Retargeting | Warm audiences",
            kind="retargeting",
            budget_share=splits["retargeting"],
            use_custom_audiences=True,
        ))

    notes = list(preset.get("notes", []))
    if not profile.lead_form.privacy_policy_url:
        notes.append("No privacy_policy_url set -- Meta requires one for lead forms. "
                     "Dry-run continues; live launch will need it.")
    min_viable = profile.budget.max_cpl * 3
    if profile.budget.daily_budget < min_viable:
        notes.append(
            f"Daily budget ({profile.budget.currency} {profile.budget.daily_budget:.0f}) is under "
            f"3x your max CPL -- expect a slow learning phase. Consider >= {profile.budget.currency} {min_viable:.0f}/day."
        )

    return CampaignPlan(
        campaign_name=f"[Agent] {profile.name} | Lead Gen",
        objective="OUTCOME_LEADS",
        daily_budget=profile.budget.daily_budget,
        currency=profile.budget.currency,
        ad_sets=ad_sets,
        notes=notes,
    )
