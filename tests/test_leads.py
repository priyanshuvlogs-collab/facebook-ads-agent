from fbads_agent.leads import export_csv, parse_lead, score_lead


def _raw(lead_id="l1", extra=None):
    field_data = [
        {"name": "full_name", "values": ["Jane Doe"]},
        {"name": "email", "values": ["jane@example.com"]},
        {"name": "phone_number", "values": ["+15551234567"]},
    ]
    if extra:
        field_data.append(extra)
    return {"id": lead_id, "created_time": "2026-08-16T00:00:00+0000",
            "field_data": field_data, "adset_id": "as1", "campaign_id": "c1"}


def test_parse_lead():
    lead = parse_lead(_raw())
    assert lead.full_name == "Jane Doe"
    assert lead.email == "jane@example.com"
    assert lead.phone == "+15551234567"


def test_scoring_grades(sample_profile):
    complete = score_lead(parse_lead(_raw()), sample_profile)
    assert complete.grade == "A"  # email+phone+full name = 70

    hot = score_lead(parse_lead(_raw(extra={
        "name": "what_treatment", "values": ["Interested in an implant"]
    })), sample_profile)
    assert hot.score > complete.score  # hot keyword bonus

    incomplete_raw = _raw()
    incomplete_raw["field_data"] = [{"name": "email", "values": ["a@b.com"]}]
    incomplete = score_lead(parse_lead(incomplete_raw), sample_profile)
    assert incomplete.grade == "C"


def test_export_csv(tmp_path, sample_profile):
    lead = score_lead(parse_lead(_raw()), sample_profile)
    path = export_csv([lead], tmp_path, "acme")
    content = path.read_text()
    assert "jane@example.com" in content
    # appending keeps a single header
    export_csv([lead], tmp_path, "acme")
    assert path.read_text().count("id,created_time") == 1
