"""Audience builder: converts profile targeting + plan into Meta targeting specs."""

from __future__ import annotations

from typing import Any

from .meta_client import MetaClient
from .profile import BusinessProfile
from .strategy import AdSetPlan

GENDER_MAP = {"all": None, "male": [1], "female": [2]}


def build_targeting_spec(profile: BusinessProfile, plan: AdSetPlan,
                         client: MetaClient) -> dict[str, Any]:
    t = profile.targeting
    spec: dict[str, Any] = {
        "geo_locations": _geo(t),
        "age_min": t.age_min,
        "age_max": t.age_max,
    }

    genders = GENDER_MAP.get(t.genders)
    if genders:
        spec["genders"] = genders
    if t.languages:
        spec["locales"] = t.languages

    if plan.kind == "prospecting" and plan.interests:
        resolved = _resolve_interests(plan.interests, client)
        if resolved:
            # Interest stacking: one flexible_spec group = OR across interests.
            spec["flexible_spec"] = [{"interests": resolved}]
    elif plan.kind == "broad":
        # No detailed targeting: Meta's delivery system explores freely
        # (Advantage detailed targeting behaviour).
        spec["targeting_automation"] = {"advantage_audience": 1}
    elif plan.kind == "retargeting" and plan.use_custom_audiences:
        spec["custom_audiences"] = [{"id": cid} for cid in t.custom_audience_ids]

    if t.exclude_audience_ids and plan.kind != "retargeting":
        # Keep cold traffic cold: exclude existing customers/leads.
        spec["excluded_custom_audiences"] = [{"id": cid} for cid in t.exclude_audience_ids]

    return spec


def _geo(t) -> dict[str, Any]:
    geo: dict[str, Any] = {}
    if t.geo.cities:
        geo["cities"] = [
            {
                "key": str(c.get("key", c.get("name", ""))),
                "name": c.get("name", ""),
                "radius": int(c.get("radius_km", 25)),
                "distance_unit": "kilometer",
            }
            for c in t.geo.cities
        ]
    if t.geo.regions:
        geo["regions"] = [{"key": r} if isinstance(r, str) else r for r in t.geo.regions]
    if t.geo.countries and not (t.geo.cities or t.geo.regions):
        geo["countries"] = t.geo.countries
    elif t.geo.countries and not geo:
        geo["countries"] = t.geo.countries
    return geo or {"countries": ["US"]}


def _resolve_interests(names: list[str], client: MetaClient) -> list[dict[str, Any]]:
    """Look up interest ids via the Graph search API; skip ones Meta can't find."""
    resolved: list[dict[str, Any]] = []
    for name in names:
        try:
            matches = client.search_interests(name, limit=1)
        except Exception:
            matches = []
        if matches:
            resolved.append({"id": matches[0]["id"], "name": matches[0].get("name", name)})
    return resolved
