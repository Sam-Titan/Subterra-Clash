"""Severity. All expected scores are worked by hand from SPEC §8.5 with today = 2026-10-28."""

from datetime import date

import pytest

from app.engine.severity import band_for, compute_severity, urgency
from app.models import Band, Certainty, ClashKind, Utility

TODAY = date(2026, 10, 28)


def sev(**kw):  # type: ignore[no-untyped-def]
    base = {
        "kind": ClashKind.CLEARANCE,
        "certainty": Certainty.LIKELY,
        "utility": Utility.GAS,
        "gap_m": 0.0,
        "required_m": 1.0,
        "start": date(2026, 11, 3),
        "today": TODAY,
    }
    return compute_severity(**{**base, **kw})


def test_t1_gas_intersection_is_100() -> None:
    # hazard 1.0, breach clamp(1.6/1.0)=1, urgency 6 d -> 1.0, LIKELY 1.0 -> 100
    s = sev(kind=ClashKind.INTERSECTION, gap_m=-0.6)
    assert (s.score, s.band) == (100, Band.CRITICAL)
    assert s.factors.model_dump() == {
        "hazard": 1.0,
        "breach": 1.0,
        "urgency": 1.0,
        "confidence": 1.0,
    }


def test_t2_power_cable_rounds_half_up_to_80() -> None:
    # 100 * (0.4*0.9 + 0.3*(0.42/0.6) + 0.15*0.5 + 0.15*1) = 79.5 -> 80
    s = sev(utility=Utility.POWER, gap_m=0.18, required_m=0.6, start=date(2026, 11, 16))
    assert (s.score, s.band) == (80, Band.CRITICAL)
    assert s.factors.breach == pytest.approx(0.7)


def test_t3_telecom_possible_rounds_half_up_to_31() -> None:
    # 100 * (0.4*0.35 + 0 + 0.15*0.5 + 0.15*0.6) = 30.5 -> 31
    s = sev(
        certainty=Certainty.POSSIBLE,
        utility=Utility.TELECOM,
        gap_m=1.05,
        required_m=0.3,
        start=date(2026, 11, 23),
    )
    assert (s.score, s.band) == (31, Band.LOW)
    assert s.factors.breach == 0.0


def test_needs_data_uses_half_breach() -> None:
    # 100 * (0.4*0.9 + 0.3*0.5 + 0.15*1.0 + 0.15*0.4) = 72
    s = sev(
        certainty=Certainty.NEEDS_DATA,
        utility=Utility.POWER,
        gap_m=None,
        required_m=0.6,
        start=date(2026, 11, 5),
    )
    assert (s.score, s.band) == (72, Band.HIGH)


def test_schedule_overlap_terms() -> None:
    # 100 * (0.4*0.5 + 0.3*0.5 + 0.15*1.0 + 0.15*1.0) = 65 -> HIGH
    s = sev(
        kind=ClashKind.SCHEDULE_OVERLAP,
        utility=None,
        gap_m=None,
        required_m=None,
        start=date(2026, 11, 9),
    )
    assert (s.score, s.band) == (65, Band.HIGH)
    assert s.factors.hazard == 0.5


def test_dig_once_is_always_info_even_with_high_score() -> None:
    s = sev(kind=ClashKind.DIG_ONCE, utility=None, gap_m=None, required_m=None)
    assert s.score == 65
    assert s.band is Band.INFO


@pytest.mark.parametrize(
    ("days", "expected"),
    [(-5, 1.0), (0, 1.0), (14, 1.0), (15, 0.5), (60, 0.5), (61, 0.2)],
)
def test_urgency_edges(days: int, expected: float) -> None:
    assert urgency(date.fromordinal(TODAY.toordinal() + days), TODAY) == expected


@pytest.mark.parametrize(
    ("score", "band"),
    [
        (100, Band.CRITICAL),
        (75, Band.CRITICAL),
        (74, Band.HIGH),
        (55, Band.HIGH),
        (54, Band.MEDIUM),
        (35, Band.MEDIUM),
        (34, Band.LOW),
        (0, Band.LOW),
    ],
)
def test_band_thresholds(score: int, band: Band) -> None:
    assert band_for(score, ClashKind.CLEARANCE) is band
