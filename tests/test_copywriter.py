import pytest

from fbads_agent.copywriter import MAX_HEADLINE, MAX_PRIMARY_TEXT, generate_copy
from fbads_agent.strategy import ANGLES


@pytest.mark.parametrize("angle", ANGLES)
def test_template_copy_all_angles(sample_profile, angle):
    copy = generate_copy(sample_profile, angle)
    assert copy.angle == angle
    assert 0 < len(copy.headline) <= MAX_HEADLINE
    assert 0 < len(copy.primary_text) <= MAX_PRIMARY_TEXT
    assert copy.call_to_action == "BOOK_NOW"  # dental industry CTA


def test_offer_appears_in_copy(sample_profile):
    copy = generate_copy(sample_profile, "offer")
    assert "free consult" in copy.primary_text.lower()


def test_tone_changes_copy(sample_profile):
    sample_profile.brand.tone = "bold"
    bold = generate_copy(sample_profile, "pain_point")
    sample_profile.brand.tone = "playful"
    playful = generate_copy(sample_profile, "pain_point")
    assert bold.primary_text != playful.primary_text
