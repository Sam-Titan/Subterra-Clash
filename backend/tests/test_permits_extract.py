from types import SimpleNamespace

import pytest

from app.config import Settings
from app.permits.extract import extract_permit, validate_llm_fields
from app.permits.models import FIELD_NAMES, ExtractionUnavailable
from app.permits.sample_permits import SAMPLE_PERMITS

TEXT = SAMPLE_PERMITS[0].text
UNSEEN = "Water pipe on Nehru Path from J2 to J6, 1.1 m deep. Work 2 Dec to 4 Dec 2026."


def settings(mode: str, key: str = "k") -> Settings:
    return Settings(_env_file=None, llm_mode=mode, anthropic_api_key=key)


class FakeClient:
    def __init__(self, tool_input=None, error: Exception | None = None) -> None:
        self.calls = 0
        self._input, self._error = tool_input, error
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls += 1
        if self._error:
            raise self._error
        block = SimpleNamespace(type="tool_use", input=self._input)
        return SimpleNamespace(content=[block])


def raw(**over) -> dict:
    base = {n: {"value": None, "confidence": 0, "source_quote": None} for n in FIELD_NAMES}
    base.update(over)
    return base


def test_empty_text_raises() -> None:
    with pytest.raises(ExtractionUnavailable):
        extract_permit("   ", settings("cached"))


def test_cached_mode_uses_fixture_and_never_calls_client() -> None:
    client = FakeClient(error=AssertionError("must not be called"))
    result = extract_permit(TEXT, settings("cached"), client)
    assert result.llm_mode_used == "cached"
    assert result.fields["permit_no"].value == "2026/STN/114"
    assert client.calls == 0


def test_cached_mode_unseen_text_falls_to_rules() -> None:
    result = extract_permit(UNSEEN, settings("cached"))
    assert result.llm_mode_used == "rules"
    assert result.fields["street"].value == "ST-04"


def test_live_success_is_validated_and_marked_live() -> None:
    tool = raw(
        street={"value": "ST-01", "confidence": 0.9, "source_quote": "Station Road"},
        depth_to_m={"value": 1.2, "confidence": 0.7, "source_quote": "approx 1.2 m deep"},
    )
    client = FakeClient(tool)
    result = extract_permit(TEXT, settings("live"), client)
    assert result.llm_mode_used == "live"
    assert result.fields["street"].value == "ST-01"
    assert "agency" in result.missing_fields


@pytest.mark.parametrize("error", [TimeoutError("slow"), RuntimeError("boom")])
def test_live_failure_falls_back_to_fixture_then_rules(error) -> None:
    assert extract_permit(TEXT, settings("live"), FakeClient(error=error)).llm_mode_used == "cached"
    assert (
        extract_permit(UNSEEN, settings("live"), FakeClient(error=error)).llm_mode_used == "rules"
    )


def test_live_without_key_does_not_call_api() -> None:
    assert extract_permit(TEXT, settings("live", key="")).llm_mode_used == "cached"


def test_live_no_tool_call_falls_back() -> None:
    client = FakeClient()
    client.messages = SimpleNamespace(create=lambda **_: SimpleNamespace(content=[]))
    assert extract_permit(TEXT, settings("live"), client).llm_mode_used == "cached"


def test_validation_nulls_invented_quote_bad_enum_and_converts_mm() -> None:
    tool = raw(
        agency={"value": "Acme", "confidence": 0.9, "source_quote": "Acme Corp"},  # not in text
        work_type={"value": "TUNNEL", "confidence": 0.9, "source_quote": "open trench"},
        street={"value": "ST-99", "confidence": 0.9, "source_quote": "Station Road"},
        diameter_m={"value": 300, "confidence": 0.8, "source_quote": "300 mm"},
        start_date={"value": "03/11/2026", "confidence": 0.8, "source_quote": "3–20 Nov 2026"},
        utility={"value": "POWER", "confidence": 7, "source_quote": "11kV  cable"},
    )
    result = validate_llm_fields(
        tool, "NVVN Discom 300 mm 11kV cable open trench Station Road 3–20 Nov 2026"
    )
    for name in ("agency", "work_type", "street", "start_date"):
        assert result.fields[name].value is None and name in result.missing_fields
    assert result.fields["diameter_m"].value == 0.3
    assert result.fields["utility"].confidence == 1.0
