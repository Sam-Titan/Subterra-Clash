import pytest

from app.permits.models import FIELD_NAMES
from app.permits.rules_extract import extract_with_rules
from app.permits.sample_permits import SAMPLE_PERMITS


def vals(text: str) -> dict:
    r = extract_with_rules(text)
    return {k: f.value for k, f in r.fields.items()}


@pytest.mark.parametrize("sample", SAMPLE_PERMITS, ids=lambda s: s.id)
def test_every_found_value_is_exact_quote_at_half_confidence(sample) -> None:
    result = extract_with_rules(sample.text)
    assert result.llm_mode_used == "rules"
    assert set(result.fields) == set(FIELD_NAMES)
    for name, field in result.fields.items():
        if field.value is None:
            assert name in result.missing_fields
        else:
            assert field.confidence == 0.5
            assert field.source_quote in sample.text


def test_sample_1_street_refs_dates() -> None:
    v = vals(SAMPLE_PERMITS[0].text)
    assert (v["street"], v["from_ref"], v["to_ref"]) == ("ST-01", "JN-03", "LM-02")
    assert (v["start_date"], v["end_date"]) == ("2026-11-03", "2026-11-20")
    assert (v["side"], v["work_type"], v["utility"]) == ("NORTH", "TRENCH", "POWER")
    assert (v["depth_to_m"], v["width_m"]) == (1.2, 0.6)


def test_sample_2_hinglish_aliases_and_mm() -> None:
    v = vals(SAMPLE_PERMITS[1].text)
    assert (v["street"], v["from_ref"], v["to_ref"]) == ("ST-01", "JN-05", "JN-07")
    assert (v["start_date"], v["end_date"]) == ("2026-11-12", "2026-11-19")
    assert (v["utility"], v["work_type"], v["side"]) == ("WATER", "TRENCH", "SOUTH")
    assert (v["diameter_m"], v["offset_m"], v["depth_to_m"]) == (0.3, 2.0, 1.5)


def test_sample_3_missing_depth_is_listed_not_defaulted() -> None:
    result = extract_with_rules(SAMPLE_PERMITS[2].text)
    v = {k: f.value for k, f in result.fields.items()}
    assert (v["street"], v["from_ref"], v["to_ref"]) == ("ST-02", "JN-01", "JN-03")
    assert (v["start_date"], v["end_date"]) == ("2026-11-24", "2026-12-02")
    for name in ("depth_from_m", "depth_to_m", "offset_m", "side"):
        assert v[name] is None and name in result.missing_fields


def test_unseen_permit_text() -> None:
    text = (
        "Gas Authority of Navgarh — permit GA/2026/088. Gas main to be laid by HDD under "
        "Gulmohar Lane between J4 and J6, depth 2.5 m, dia 160 mm. Works 1 Dec to 9 Dec 2026."
    )
    v = vals(text)
    assert (v["utility"], v["work_type"]) == ("GAS", "HDD")
    assert (v["street"], v["from_ref"], v["to_ref"]) == ("ST-03", "JN-04", "JN-06")
    assert (v["depth_to_m"], v["diameter_m"]) == (2.5, 0.16)
    assert v["depth_from_m"] is None  # HDD bore top not stated
    assert (v["start_date"], v["end_date"]) == ("2026-12-01", "2026-12-09")


def test_single_ref_direction_and_unknown_junction() -> None:
    assert vals("Trench on Nehru Path up to J6 tak")["to_ref"] == "JN-06"
    assert vals("Trench on Nehru Path from J2")["from_ref"] == "JN-02"
    v = vals("Trench on Nehru Path from J99 to J2")  # J99 is not in the gazetteer
    assert v["from_ref"] is None and v["to_ref"] == "JN-02"


def test_width_in_mm_is_not_taken_as_diameter() -> None:
    v = vals("Trench 600 mm wide on Lake View Road")
    assert v["width_m"] == 0.6 and v["diameter_m"] is None


def test_date_without_year_is_not_guessed() -> None:
    v = vals("Trench on Nehru Path, 3 Nov to 5 Nov")
    assert v["start_date"] is None and v["end_date"] is None


def test_nothing_found_everything_missing() -> None:
    result = extract_with_rules("hello world")
    assert result.missing_fields == list(FIELD_NAMES)
