from app.permits.geocode import geocode, resolve_ref, resolve_street
from app.permits.models import ExtractedField


def _fields(**values: str | float | None) -> dict[str, ExtractedField]:
    return {
        k: ExtractedField(value=v, confidence=0.9 if v is not None else 0.0)
        for k, v in values.items()
    }


def test_aliases_resolve_case_insensitively() -> None:
    assert resolve_street("stn rd").id == "ST-01"
    assert resolve_street("VIKAS MARG").id == "ST-02"
    assert resolve_street("ST-03").id == "ST-03"
    assert resolve_ref("J3") == "JN-03"
    assert resolve_ref("jn-05") == "JN-05"
    assert resolve_ref("bus depot") == "LM-02"
    assert resolve_ref("LM-04") == "LM-04"
    assert resolve_street("Mall Road") is None
    assert resolve_ref("J99") is None


def test_sample1_north_side_default_offset() -> None:
    # Station Road is 18 m wide: default = 9 - 3 = 6 m north of y=200; Bus Depot projects to x=420.
    g = geocode(_fields(street="ST-01", from_ref="JN-03", to_ref="LM-02", side="NORTH"))
    assert g.status == "RESOLVED"
    assert g.path == [(180.0, 206.0), (420.0, 206.0)]
    assert any("offset_m missing" in n for n in g.notes)


def test_explicit_offset_is_from_centreline() -> None:
    g = geocode(_fields(street="stn rd", from_ref="J5", to_ref="J7", side="SOUTH", offset_m=2.0))
    assert g.status == "RESOLVED"
    assert g.path == [(400.0, 198.0), (520.0, 198.0)]


def test_vertical_street_east_side_and_reversed_refs() -> None:
    east = _fields(street="ST-02", from_ref="JN-01", to_ref="JN-03", side="EAST", offset_m=2)
    g = geocode(east)
    assert g.path == [(182.0, 80.0), (182.0, 200.0)]
    back = geocode(
        _fields(street="ST-02", from_ref="JN-03", to_ref="JN-01", side="WEST", offset_m=2)
    )
    assert back.path == [(178.0, 200.0), (178.0, 80.0)]


def test_side_missing_is_partial_on_centreline() -> None:
    g = geocode(_fields(street="ST-02", from_ref="JN-01", to_ref="JN-03", side=None))
    assert g.status == "PARTIAL"
    assert g.path == [(180.0, 80.0), (180.0, 200.0)]
    assert any("side missing" in n for n in g.notes)


def test_side_not_on_street_axis_is_partial() -> None:
    g = geocode(_fields(street="ST-02", from_ref="JN-01", to_ref="JN-03", side="NORTH"))
    assert g.status == "PARTIAL"
    assert g.path == [(180.0, 80.0), (180.0, 200.0)]


def test_failed_cases_have_no_path() -> None:
    assert geocode(_fields(street="Mall Road", from_ref="J1", to_ref="J3")).status == "FAILED"
    assert geocode(_fields(street="ST-01", from_ref=None, to_ref="J3")).path == []
    same = geocode(_fields(street="ST-01", from_ref="JN-03", to_ref="JN-03", side="NORTH"))
    assert same.status == "FAILED"
