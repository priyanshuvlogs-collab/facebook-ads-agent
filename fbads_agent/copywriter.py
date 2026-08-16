"""AI copywriter: generates ad copy variants per creative angle.

If an LLM is configured (OpenAI or Anthropic via plain REST), copy is generated
by the model with a conversion-focused prompt. Otherwise a rich template
engine, parameterized by the business profile and brand tone, produces solid
defaults so the agent never blocks on a missing API key.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import requests

from .profile import BusinessProfile
from .settings import Settings

MAX_HEADLINE = 40      # Meta truncates around here in most placements
MAX_PRIMARY_TEXT = 350


@dataclass
class AdCopy:
    angle: str
    primary_text: str
    headline: str
    description: str
    call_to_action: str = "SIGN_UP"


TONE_OPENERS = {
    "friendly": {"pain_point": "Tired of", "offer": "Good news:", "social_proof": "Join the"},
    "professional": {"pain_point": "Struggling with", "offer": "Introducing:", "social_proof": "Trusted by"},
    "bold": {"pain_point": "STOP wasting money on", "offer": "LIMITED:", "social_proof": "1,000+ people chose"},
    "playful": {"pain_point": "Ugh,", "offer": "Psst...", "social_proof": "Everyone's talking about"},
}

CTA_BY_INDUSTRY = {
    "real_estate": "GET_QUOTE",
    "dental": "BOOK_NOW",
    "fitness": "SIGN_UP",
    "saas": "LEARN_MORE",
    "ecommerce": "SHOP_NOW",
    "legal": "CONTACT_US",
    "home_services": "GET_QUOTE",
    "education": "APPLY_NOW",
    "automotive": "GET_QUOTE",
    "insurance": "GET_QUOTE",
}


def generate_copy(profile: BusinessProfile, angle: str, settings: Settings | None = None,
                  variant: int = 0) -> AdCopy:
    if settings and settings.llm_provider and settings.llm_api_key:
        try:
            return _generate_with_llm(profile, angle, settings)
        except Exception:
            pass  # never block a launch on an LLM hiccup; templates are solid
    return _generate_with_templates(profile, angle, variant)


# ---------------------------------------------------------------------------
# Template engine (zero-dependency default)
# ---------------------------------------------------------------------------

def _generate_with_templates(profile: BusinessProfile, angle: str, variant: int = 0) -> AdCopy:
    from .strategy import resolve_industry

    tone = profile.brand.tone if profile.brand.tone in TONE_OPENERS else "friendly"
    openers = TONE_OPENERS[tone]
    industry = resolve_industry(profile.industry)
    cta = CTA_BY_INDUSTRY.get(industry, "SIGN_UP")

    offer = profile.offer.headline_offer or profile.offer.lead_magnet or \
        f"a free consultation with {profile.name}"
    usp = profile.unique_selling_points[variant % len(profile.unique_selling_points)] \
        if profile.unique_selling_points else profile.description or profile.name
    urgency = profile.offer.urgency or "Spots are limited this month."
    guarantee = profile.offer.guarantees[0] if profile.offer.guarantees else ""

    if angle == "pain_point":
        primary = (
            f"{openers['pain_point']} settling for less than you deserve?\n\n"
            f"{usp}\n\n"
            f"Claim {offer} today -- it takes 30 seconds and costs nothing. {urgency}"
        )
        headline = _clip(f"{offer}".capitalize(), MAX_HEADLINE)
        description = "No obligation. No spam. Just results."
    elif angle == "offer":
        primary = (
            f"{openers['offer']} {offer} from {profile.name}.\n\n"
            f"Here's what you get:\n"
            f"{_bullets(profile)}\n"
            f"{urgency} Tap below and grab yours before it's gone."
        )
        headline = _clip(f"Free: {offer}" if "free" not in offer.lower() else offer.capitalize(),
                         MAX_HEADLINE)
        description = guarantee or "Limited availability -- claim yours now."
    else:  # social_proof
        primary = (
            f"{openers['social_proof']} people who switched to {profile.name}.\n\n"
            f"\u2b50\u2b50\u2b50\u2b50\u2b50 \"Exactly what I was looking for -- fast, easy, "
            f"and it actually worked.\"\n\n"
            f"See why they made the move: get {offer}. {urgency}"
        )
        headline = _clip(f"Why everyone picks {profile.name}", MAX_HEADLINE)
        description = guarantee or "Rated 5 stars by customers like you."

    return AdCopy(
        angle=angle,
        primary_text=_clip(primary, MAX_PRIMARY_TEXT),
        headline=headline,
        description=_clip(description, 60),
        call_to_action=cta,
    )


def _bullets(profile: BusinessProfile) -> str:
    points = profile.unique_selling_points[:3] or [
        "Fast, personal service",
        "Proven results",
        "Zero pressure, zero obligation",
    ]
    return "\n".join(f"\u2705 {p}" for p in points)


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "\u2026"


# ---------------------------------------------------------------------------
# LLM providers (plain REST, no SDK dependency)
# ---------------------------------------------------------------------------

_PROMPT = """You are a direct-response copywriter who writes Facebook lead ads.
Write ONE ad for the business below using the "{angle}" angle.
Angle definitions: pain_point = agitate the problem then present the offer;
offer = lead with the irresistible offer and stack value; social_proof = lead
with testimonials/popularity.

Business: {name} ({industry})
Description: {description}
Offer: {offer}
Unique selling points: {usps}
Urgency: {urgency}
Brand tone: {tone}

Rules: primary_text <= 300 chars with line breaks, headline <= 38 chars,
description <= 55 chars. No hashtags. No emojis in headline. Must comply with
Meta ad policies (no personal attributes like "Are you diabetic?").

Respond with ONLY a JSON object: {{"primary_text": "...", "headline": "...",
"description": "..."}}"""


def _llm_prompt(profile: BusinessProfile, angle: str) -> str:
    return _PROMPT.format(
        angle=angle,
        name=profile.name,
        industry=profile.industry,
        description=profile.description,
        offer=profile.offer.headline_offer or profile.offer.lead_magnet,
        usps="; ".join(profile.unique_selling_points),
        urgency=profile.offer.urgency,
        tone=profile.brand.tone,
    )


def _generate_with_llm(profile: BusinessProfile, angle: str, settings: Settings) -> AdCopy:
    prompt = _llm_prompt(profile, angle)
    if settings.llm_provider == "openai":
        text = _call_openai(prompt, settings)
    elif settings.llm_provider == "anthropic":
        text = _call_anthropic(prompt, settings)
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")

    data = json.loads(_extract_json(text))
    from .strategy import resolve_industry

    return AdCopy(
        angle=angle,
        primary_text=_clip(str(data["primary_text"]), MAX_PRIMARY_TEXT),
        headline=_clip(str(data["headline"]), MAX_HEADLINE),
        description=_clip(str(data.get("description", "")), 60),
        call_to_action=CTA_BY_INDUSTRY.get(resolve_industry(profile.industry), "SIGN_UP"),
    )


def _call_openai(prompt: str, settings: Settings) -> str:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.llm_api_key}"},
        json={
            "model": settings.llm_model or "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_anthropic(prompt: str, settings: Settings) -> str:
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.llm_api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": settings.llm_model or "claude-3-5-haiku-latest",
            "max_tokens": 600,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("LLM response contained no JSON object")
    return text[start : end + 1]
