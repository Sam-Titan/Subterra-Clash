from datetime import date

import pytest
from pydantic import ValidationError

from app.models import (
    Asset,
    Band,
    Certainty,
    Clash,
    ClashKind,
    RecordMethod,
    ReviewStatus,
    Utility,
    Work,
    WorkOrigin,
    WorkType,
)


def test_enum_values_match_spec() -> None:
    assert {u.value for u in Utility} == {"WATER", "SEWER", "POWER", "TELECOM", "GAS"}
    assert {w.value for w in WorkType} == {"TRENCH", "PIT", "HDD", "PIPE_LAY"}
    assert {o.value for o in WorkOrigin} == {"SEED", "INTAKE"}
    assert {m.value for m in RecordMethod} == {"SURVEYED", "AS_BUILT", "DIGITISED", "ESTIMATED"}
    assert {k.value for k in ClashKind} == {
        "INTERSECTION",
        "CLEARANCE",
        "SCHEDULE_OVERLAP",
        "DIG_ONCE",
    }
    assert {c.value for c in Certainty} == {"LIKELY", "POSSIBLE", "NEEDS_DATA"}
    assert {b.value for b in Band} == {"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}
    assert {s.value for s in ReviewStatus} == {"OPEN", "ACKNOWLEDGED", "ESCALATED", "DISMISSED"}


def _asset(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "AST-0042",
        "utility": "WATER",
        "owner": "Navgarh Jal Board",
        "label": "300 mm DI water main",
        "path": [[0, 0, -1.2], [10, 0, -1.2]],
        "diameter_m": 0.3,
        "horiz_precision_m": 0.1,
        "depth_precision_m": 0.1,
        "depth_known": True,
        "source_record": {
            "record_id": "NJB-1",
            "source": "register",
            "captured_on": "2020-01-02",
            "method": "SURVEYED",
        },
    }
    base.update(over)
    return base


def test_asset_round_trip_and_unknown_depth() -> None:
    a = Asset.model_validate(_asset())
    assert a.source_record.captured_on == date(2020, 1, 2)
    assert Asset.model_validate(a.model_dump(mode="json")) == a
    unknown = Asset.model_validate(_asset(depth_precision_m=None, depth_known=False))
    assert unknown.depth_precision_m is None


def test_id_prefixes_enforced() -> None:
    with pytest.raises(ValidationError):
        Asset.model_validate(_asset(id="WRK-0042"))


def test_work_defaults_to_seed_origin() -> None:
    w = Work.model_validate(
        {
            "id": "WRK-007",
            "title": "Fibre ducting",
            "agency": "Navgarh FiberNet",
            "work_type": "TRENCH",
            "path": [[0, 0], [10, 0]],
            "width_m": 0.6,
            "depth_from_m": 0,
            "depth_to_m": 1.2,
            "start_date": "2026-11-03",
            "end_date": "2026-11-20",
            "source_permit": {
                "permit_no": "X/1",
                "source": "portal",
                "submitted_on": "2026-10-01",
            },
        }
    )
    assert w.origin is WorkOrigin.SEED
    assert w.utility is None and w.bore_path is None
    assert w.field_confidence == {} and w.missing_fields == []


def test_clash_review_defaults_open() -> None:
    c = Clash.model_validate(
        {
            "id": "CLH-0019",
            "kind": "CLEARANCE",
            "certainty": "NEEDS_DATA",
            "severity": {
                "score": 57,
                "band": "HIGH",
                "factors": {"hazard": 0.9, "breach": 0.5, "urgency": 1.0, "confidence": 0.4},
            },
            "work_ids": ["WRK-002"],
            "asset_ids": ["AST-0005"],
            "location": {"x": 174, "y": 232, "z": -1.0},
            "explanation": "Depth of AST-0005 is not recorded.",
            "missing_data": ["AST-0005.depth"],
            "group_id": "GRP-02",
            "baseline_flagged": True,
        }
    )
    assert c.review.status is ReviewStatus.OPEN
    assert c.review.reviewer is None and c.review.updated_at is None
    assert c.measured_gap_m is None and c.schedule is None
