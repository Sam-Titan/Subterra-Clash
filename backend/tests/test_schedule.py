"""Schedule rules. Trench A footprint y -1..1; B at y=6 -> y 5..7, 4.0 m apart (<= 5)."""

from datetime import date

from factories import make_work

from app.engine.schedule import detect_schedule
from app.models import ClashKind

A = make_work(id="WRK-001", start=date(2026, 11, 1), end=date(2026, 11, 10))


def b(start: date, end: date, y: float = 6.0) -> object:
    return make_work(id="WRK-002", path=[(0.0, y), (10.0, y)], start=start, end=end)


def test_overlap_counts_both_end_dates() -> None:
    # Nov 6..10 inclusive = 5 days
    (f,) = detect_schedule([A, b(date(2026, 11, 6), date(2026, 11, 20))])  # type: ignore[list-item]
    assert f.kind is ClashKind.SCHEDULE_OVERLAP
    assert f.overlap_days == 5
    assert f.gap_days == 0
    assert (f.work_a.id, f.work_b.id) == ("WRK-001", "WRK-002")
    assert f.location[1] == 3.0  # midway between footprint edges y=1 and y=5
    assert f.location[2] == 0.0


def test_touching_on_one_day_is_one_day_overlap() -> None:
    (f,) = detect_schedule([A, b(date(2026, 11, 10), date(2026, 11, 12))])  # type: ignore[list-item]
    assert f.kind is ClashKind.SCHEDULE_OVERLAP
    assert f.overlap_days == 1


def test_dig_once_gap_is_start_minus_end() -> None:
    (f,) = detect_schedule([A, b(date(2026, 11, 25), date(2026, 12, 1))])  # type: ignore[list-item]
    assert f.kind is ClashKind.DIG_ONCE
    assert f.gap_days == 15  # Nov 10 -> Nov 25
    assert f.overlap_days == 0


def test_dig_once_window_edges() -> None:
    # Nov 10 -> Feb 8 = 20 (Nov) + 31 (Dec) + 31 (Jan) + 8 = 90 days -> still dig-once
    (f,) = detect_schedule([A, b(date(2027, 2, 8), date(2027, 2, 12))])  # type: ignore[list-item]
    assert f.kind is ClashKind.DIG_ONCE
    assert f.gap_days == 90
    # one day later -> 91 days -> nothing
    assert detect_schedule([A, b(date(2027, 2, 9), date(2027, 2, 12))]) == []  # type: ignore[list-item]


def test_order_of_dates_does_not_matter() -> None:
    early = make_work(
        id="WRK-009", path=[(0.0, 6.0), (10.0, 6.0)], start=date(2026, 9, 1), end=date(2026, 9, 10)
    )
    (f,) = detect_schedule([A, early])
    assert f.kind is ClashKind.DIG_ONCE
    assert f.gap_days == 52  # Sep 10 -> Nov 1 = 20 + 31 + 1
    assert (f.work_a.id, f.work_b.id) == ("WRK-001", "WRK-009")


def test_works_more_than_5m_apart_are_ignored() -> None:
    # y=8 -> footprint 7..9, distance 6 m
    assert detect_schedule([A, b(date(2026, 11, 6), date(2026, 11, 8), y=8.0)]) == []  # type: ignore[list-item]


def test_single_work_has_no_pairs() -> None:
    assert detect_schedule([A]) == []
