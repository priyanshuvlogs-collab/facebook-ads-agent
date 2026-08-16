"""Campaign builder: materializes a CampaignPlan into real (or simulated) Meta entities.

Structure created:

    Campaign (OUTCOME_LEADS)
      +- Ad set per plan entry (budget at ad-set level so the optimizer can
      |    rebalance money between audiences)
      |    +- One ad per creative angle (instant-form lead ads)
      +- One shared Instant Form (lead form) on the Page
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .audience import build_targeting_spec
from .copywriter import generate_copy
from .meta_client import MetaClient, to_minor_units
from .profile import BusinessProfile
from .settings import Settings
from .state import StateStore
from .strategy import CampaignPlan

STANDARD_QUESTION_TYPES = {
    "FULL_NAME", "EMAIL", "PHONE", "CITY", "ZIP", "JOB_TITLE",
    "COMPANY_NAME", "WORK_EMAIL", "STATE", "COUNTRY", "DOB", "GENDER",
}


@dataclass
class LaunchResult:
    campaign_id: str
    lead_form_id: str
    ad_set_ids: list[str] = field(default_factory=list)
    ad_ids: list[str] = field(default_factory=list)
    details: list[dict[str, Any]] = field(default_factory=list)


def build_lead_form_questions(profile: BusinessProfile) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    for q in profile.lead_form.questions:
        q_upper = str(q).upper().strip()
        if q_upper in STANDARD_QUESTION_TYPES:
            questions.append({"type": q_upper})
    for custom in profile.lead_form.custom_questions:
        questions.append({"type": "CUSTOM", "label": custom})
    if not questions:
        questions = [{"type": "FULL_NAME"}, {"type": "EMAIL"}, {"type": "PHONE"}]
    return questions


def launch(profile: BusinessProfile, plan: CampaignPlan, client: MetaClient,
           settings: Settings, state: StateStore, activate: bool = True) -> LaunchResult:
    """Create the full campaign tree. Entities are created PAUSED and only the
    final activation flips them on, so a mid-launch failure never leaks spend.
    """
    status_final = "ACTIVE" if activate else "PAUSED"

    lead_form_id = client.create_lead_form(
        name=f"{profile.name} - Lead Form",
        questions=build_lead_form_questions(profile),
        privacy_policy_url=profile.lead_form.privacy_policy_url or profile.website,
        thank_you={
            "title": "Thank you!",
            "body": profile.lead_form.thank_you_message,
            "button_text": "Visit website" if (profile.lead_form.follow_up_url or profile.website) else "Done",
            "website_url": profile.lead_form.follow_up_url or profile.website or None,
        },
    )
    state.log_action("create_lead_form", id=lead_form_id)

    campaign_id = client.create_campaign(
        name=plan.campaign_name,
        objective=plan.objective,
        daily_budget_minor=None,  # budgets live on ad sets for granular control
        status="PAUSED",
    )
    state.log_action("create_campaign", id=campaign_id, name=plan.campaign_name)

    result = LaunchResult(campaign_id=campaign_id, lead_form_id=lead_form_id)

    for ad_set_plan in plan.ad_sets:
        budget = round(plan.daily_budget * ad_set_plan.budget_share, 2)
        targeting = build_targeting_spec(profile, ad_set_plan, client)
        ad_set_id = client.create_ad_set(
            campaign_id=campaign_id,
            name=f"{ad_set_plan.name}",
            daily_budget_minor=to_minor_units(budget, plan.currency),
            targeting=targeting,
            optimization_goal="LEAD_GENERATION",
            promoted_object={"page_id": settings.page_id or "SIMULATED_PAGE"},
            status="PAUSED",
        )
        result.ad_set_ids.append(ad_set_id)
        state.log_action("create_ad_set", id=ad_set_id, name=ad_set_plan.name,
                         daily_budget=budget)

        ads_detail = []
        for i, angle in enumerate(ad_set_plan.angles):
            copy = generate_copy(profile, angle, settings, variant=i)
            image_url = (profile.brand.image_urls[i % len(profile.brand.image_urls)]
                         if profile.brand.image_urls else None)
            creative_id = client.create_ad_creative(
                name=f"{profile.slug}-{ad_set_plan.kind}-{angle}",
                page_id=settings.page_id or "SIMULATED_PAGE",
                message=copy.primary_text,
                headline=copy.headline,
                description=copy.description,
                link=profile.website,
                image_url=image_url,
                call_to_action=copy.call_to_action,
                lead_form_id=lead_form_id,
            )
            ad_id = client.create_ad(
                ad_set_id=ad_set_id,
                name=f"{ad_set_plan.kind} | {angle}",
                creative_id=creative_id,
                status="PAUSED",
            )
            result.ad_ids.append(ad_id)
            ads_detail.append({"ad_id": ad_id, "angle": angle,
                               "headline": copy.headline})
            state.log_action("create_ad", id=ad_id, angle=angle)

        result.details.append({
            "ad_set_id": ad_set_id, "name": ad_set_plan.name, "kind": ad_set_plan.kind,
            "daily_budget": budget, "ads": ads_detail,
        })

    if activate:
        for ad_id in result.ad_ids:
            client.set_status(ad_id, status_final)
        for ad_set_id in result.ad_set_ids:
            client.set_status(ad_set_id, status_final)
        client.set_status(campaign_id, status_final)
        state.log_action("activate_campaign", id=campaign_id)

    state.save()
    return result
