from datetime import date

import pytest

from app.models import Utility, WorkOrigin, WorkType
from app.permits.extract import extract_permit
from app.permits.geocode import geocode
from app.permits.intake import (
    DraftIncomplete,
    InvalidFieldValue,
    apply_edits,
    build_work,
    coerce_field,
    intake_uncertainty,
    next_work_id,
)
from app.permits.sample_permits import SAMPLE_PERMITS

TODAY = date(2026, 10, 28)


def _work(index: int):
    fields = dict(extract_permit(SAMPLE_PERMITS[index].text).fields)
    return fields, build_work(fields, geocode(fields), "WRK-012", TODAY)


def test_sample1_work() -> None:
    _, w = _work(0)
    assert (w.id, w.origin, w.work_type, w.utility) == (
        "WRK-012",
        WorkOrigin.INTAKE,
        WorkType.TRENCH,
        Utility.POWER,
    )
    assert (w.width_m, w.depth_from_m, w.depth_to_m) == (0.6, 0.0, 1.2)
    assert w.path == [(180.0, 206.0), (420.0, 206.0)]
    assert w.missing_fields == ["offset_m", "diameter_m"]
    assert w.field_confidence["street"] == 0.95
    # (1 - 0.86) * 2 + 1.0 (offset missing)
    assert intake_uncertainty(w) == pytest.approx(1.28)


def test_sample2_width_assumed_and_listed() -> None:
    _, w = _work(1)
    assert w.width_m == 0.6
    assert "width_m" in w.missing_fields
    # (1 - 0.85) * 2 = 0.3, no missing offset, +0.3 assumed width
    assert intake_uncertainty(w) == pytest.approx(0.6)


def test_sample3_depth_missing_is_listed_not_defaulted() -> None:
    _, w = _work(2)
    assert {"depth_from_m", "depth_to_m", "side"} <= set(w.missing_fields)
    assert w.depth_to_m == 3.0  # placeholder; engine reads missing_fields


def test_seed_works_have_no_uncertainty(store) -> None:
    assert all(intake_uncertainty(w) == 0 for w in store.scene.works)


def test_missing_dates_block_build() -> None:
    fields, _ = _work(0)
    apply_edits(fields, {"start_date": None})
    with pytest.raises(DraftIncomplete) as exc:
        build_work(fields, geocode(fields), "WRK-012", TODAY)
    assert exc.value.missing == ["start_date"]


def test_coerce_field() -> None:
    assert coerce_field("street", "stn rd") == "ST-01"
    assert coerce_field("from_ref", "J3") == "JN-03"
    assert coerce_field("side", "north") == "NORTH"
    assert coerce_field("depth_to_m", "1.5") == 1.5
    assert coerce_field("start_date", "2026-11-03") == "2026-11-03"
    assert coerce_field("width_m", None) is None
    for name, bad in [("work_type", "TUNNEL"), ("depth_to_m", -1), ("start_date", "3 Nov"),
                      ("street", "Mall Road"), ("width_m", True)]:  # fmt: skip
        with pytest.raises(InvalidFieldValue):
            coerce_field(name, bad)


def test_apply_edits_sets_confidence_and_quote() -> None:
    fields, _ = _work(0)
    apply_edits(fields, {"offset_m": 2, "diameter_m": None})
    assert fields["offset_m"].value == 2.0
    assert fields["offset_m"].confidence == 1.0
    assert fields["offset_m"].source_quote == "edited by reviewer"


def test_next_work_id() -> None:
    assert next_work_id(["WRK-001", "WRK-011"]) == "WRK-012"
    assert next_work_id([]) == "WRK-001"
