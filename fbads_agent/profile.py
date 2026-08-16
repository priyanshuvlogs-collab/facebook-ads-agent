"""Business profile: the single plug-and-play input that adapts the agent to any business.

A profile is a YAML file describing the business, its offer, who to target,
how much to spend and how aggressively to optimize. Everything else -- funnel
design, campaign structure, ad copy, optimization rules -- is derived from it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


class ProfileError(ValueError):
    """Raised when a business profile is missing or invalid."""


@dataclass
class GeoTarget:
    countries: list[str] = field(default_factory=lambda: ["US"])
    regions: list[str] = field(default_factory=list)
    cities: list[dict[str, Any]] = field(default_factory=list)  # {name, radius_km}


@dataclass
class Targeting:
    geo: GeoTarget = field(default_factory=GeoTarget)
    age_min: int = 18
    age_max: int = 65
    genders: str = "all"  # all | male | female
    languages: list[str] = field(default_factory=list)
    interests: list[str] = field(default_factory=list)
    behaviors: list[str] = field(default_factory=list)
    custom_audience_ids: list[str] = field(default_factory=list)
    exclude_audience_ids: list[str] = field(default_factory=list)


@dataclass
class Offer:
    headline_offer: str = ""
    lead_magnet: str = ""
    price_point: str = ""
    urgency: str = ""
    guarantees: list[str] = field(default_factory=list)


@dataclass
class Budget:
    daily_budget: float = 50.0
    currency: str = "USD"
    max_cpl: float = 25.0  # target ceiling for cost-per-lead


@dataclass
class LeadForm:
    privacy_policy_url: str = ""
    questions: list[str] = field(
        default_factory=lambda: ["FULL_NAME", "EMAIL", "PHONE"]
    )
    custom_questions: list[str] = field(default_factory=list)
    thank_you_message: str = "Thanks! We'll be in touch within 24 hours."
    follow_up_url: str = ""


@dataclass
class Brand:
    tone: str = "friendly"  # friendly | professional | bold | playful
    image_urls: list[str] = field(default_factory=list)
    video_urls: list[str] = field(default_factory=list)
    primary_color: str = ""


@dataclass
class OptimizationPolicy:
    min_leads_before_judgement: int = 5
    learning_phase_days: int = 3
    kill_multiplier: float = 1.5  # pause when CPL > kill_multiplier * max_cpl
    scale_step_pct: float = 20.0  # budget increase step for winners
    scale_trigger: float = 0.7    # scale when CPL < scale_trigger * max_cpl
    max_daily_budget: float = 200.0
    min_ctr_pct: float = 0.5      # pause creatives below this CTR after learning
    frequency_cap: float = 4.0    # refresh creative when frequency exceeds this


@dataclass
class LeadScoring:
    hot_keywords: list[str] = field(default_factory=list)
    require_phone: bool = False


@dataclass
class BusinessProfile:
    name: str
    industry: str
    description: str = ""
    website: str = ""
    unique_selling_points: list[str] = field(default_factory=list)
    offer: Offer = field(default_factory=Offer)
    targeting: Targeting = field(default_factory=Targeting)
    budget: Budget = field(default_factory=Budget)
    lead_form: LeadForm = field(default_factory=LeadForm)
    brand: Brand = field(default_factory=Brand)
    optimization: OptimizationPolicy = field(default_factory=OptimizationPolicy)
    lead_scoring: LeadScoring = field(default_factory=LeadScoring)

    @property
    def slug(self) -> str:
        return "".join(c if c.isalnum() else "-" for c in self.name.lower()).strip("-")


def _pick(data: dict[str, Any], keys: dict[str, Any]) -> dict[str, Any]:
    """Filter a raw dict down to known keys, applying defaults for the rest."""
    return {k: data[k] for k in keys if k in data}


def load_profile(path: str | Path) -> BusinessProfile:
    path = Path(path)
    if not path.exists():
        raise ProfileError(f"Profile file not found: {path}")

    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except yaml.YAMLError as exc:
        raise ProfileError(f"Profile is not valid YAML: {exc}") from exc

    return profile_from_dict(raw)


def profile_from_dict(raw: dict[str, Any]) -> BusinessProfile:
    business = raw.get("business") or {}
    if not business.get("name"):
        raise ProfileError("Profile must set business.name")
    if not business.get("industry"):
        raise ProfileError("Profile must set business.industry")

    targeting_raw = raw.get("targeting") or {}
    geo = GeoTarget(
        countries=targeting_raw.get("countries", ["US"]),
        regions=targeting_raw.get("regions", []),
        cities=targeting_raw.get("cities", []),
    )
    targeting = Targeting(
        geo=geo,
        **_pick(
            targeting_raw,
            {
                "age_min": 18,
                "age_max": 65,
                "genders": "all",
                "languages": [],
                "interests": [],
                "behaviors": [],
                "custom_audience_ids": [],
                "exclude_audience_ids": [],
            },
        ),
    )
    _validate_targeting(targeting)

    budget_raw = raw.get("budget") or {}
    if not budget_raw.get("daily_budget") or float(budget_raw["daily_budget"]) <= 0:
        raise ProfileError("budget.daily_budget must be set and > 0")
    if not budget_raw.get("max_cpl") or float(budget_raw["max_cpl"]) <= 0:
        raise ProfileError("budget.max_cpl must be set and > 0 (your acceptable cost per lead)")
    budget = Budget(**_pick(budget_raw, {"daily_budget": 0, "currency": "", "max_cpl": 0}))

    profile = BusinessProfile(
        name=business["name"],
        industry=str(business["industry"]).lower().strip(),
        description=business.get("description", ""),
        website=business.get("website", ""),
        unique_selling_points=business.get("unique_selling_points", []),
        offer=Offer(**_pick(raw.get("offer") or {}, {
            "headline_offer": "", "lead_magnet": "", "price_point": "",
            "urgency": "", "guarantees": [],
        })),
        targeting=targeting,
        budget=budget,
        lead_form=LeadForm(**_pick(raw.get("lead_form") or {}, {
            "privacy_policy_url": "", "questions": [], "custom_questions": [],
            "thank_you_message": "", "follow_up_url": "",
        })),
        brand=Brand(**_pick(raw.get("brand") or {}, {
            "tone": "", "image_urls": [], "video_urls": [], "primary_color": "",
        })),
        optimization=OptimizationPolicy(**_pick(raw.get("optimization") or {}, {
            "min_leads_before_judgement": 0, "learning_phase_days": 0,
            "kill_multiplier": 0.0, "scale_step_pct": 0.0, "scale_trigger": 0.0,
            "max_daily_budget": 0.0, "min_ctr_pct": 0.0, "frequency_cap": 0.0,
        })),
        lead_scoring=LeadScoring(**_pick(raw.get("lead_scoring") or {}, {
            "hot_keywords": [], "require_phone": False,
        })),
    )
    return profile


def _validate_targeting(t: Targeting) -> None:
    if t.age_min < 18:
        raise ProfileError("targeting.age_min must be >= 18 (Meta policy)")
    if t.age_max < t.age_min:
        raise ProfileError("targeting.age_max must be >= age_min")
    if t.genders not in {"all", "male", "female"}:
        raise ProfileError("targeting.genders must be one of: all, male, female")
    if not (t.geo.countries or t.geo.regions or t.geo.cities):
        raise ProfileError("targeting must include at least one geo (countries/regions/cities)")
