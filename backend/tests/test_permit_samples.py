from app.data.gazetteer import JUNCTIONS, LANDMARKS, STREETS
from app.permits.models import FIELD_NAMES, ExtractionResult
from app.permits.sample_permits import SAMPLE_PERMITS, get_sample

REF_IDS = {j.id for j in JUNCTIONS} | {lm.id for lm in LANDMARKS}
STREET_IDS = {s.id for s in STREETS}


def _fixture(sample) -> ExtractionResult:
    return ExtractionResult.model_validate_json(sample.fixture_path.read_text(encoding="utf-8"))


def test_three_unique_samples() -> None:
    assert [s.id for s in SAMPLE_PERMITS] == ["sample-1", "sample-2", "sample-3"]
    assert get_sample("sample-2") is SAMPLE_PERMITS[1]
    assert get_sample("nope") is None


def test_fixtures_cover_every_field_with_exact_quotes() -> None:
    for sample in SAMPLE_PERMITS:
        result = _fixture(sample)
        assert set(result.fields) == set(FIELD_NAMES)
        assert result.llm_mode_used == "cached"
        for name, field in result.fields.items():
            if field.value is None:
                assert field.source_quote is None and field.confidence == 0
                assert name in result.missing_fields
            else:
                assert field.source_quote and field.source_quote in sample.text, (sample.id, name)
                assert name not in result.missing_fields


def test_fixture_refs_exist_in_gazetteer() -> None:
    for sample in SAMPLE_PERMITS:
        fields = _fixture(sample).fields
        assert fields["street"].value in STREET_IDS
        assert fields["from_ref"].value in REF_IDS
        assert fields["to_ref"].value in REF_IDS


def test_sample_two_uses_junctions_in_gazetteer_and_mm_converted() -> None:
    fields = _fixture(SAMPLE_PERMITS[1]).fields
    assert (fields["from_ref"].value, fields["to_ref"].value) == ("JN-05", "JN-07")
    assert fields["diameter_m"].value == 0.3


def test_sample_three_has_no_depth_and_no_offset() -> None:
    result = _fixture(SAMPLE_PERMITS[2])
    for name in ("depth_from_m", "depth_to_m", "offset_m"):
        assert name in result.missing_fields
    assert result.fields["work_type"].value == "TRENCH"
    assert result.fields["utility"].value == "TELECOM"
