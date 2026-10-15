"""Geometry tests. Every expected value is computed by hand (comments show the working)."""

import math
from datetime import date

import pytest

from app.data.loader import load_scene, load_truth
from app.engine.geometry import (
    ASSET_FOOTPRINT_MARGIN_M,
    SEARCH_MARGIN_M,
    asset_footprint,
    depth_at,
    excavation_gap,
    pipe_gap,
    pipe_work_centreline,
    polyline_distance,
    segment_distance,
    work_asset_gap,
    work_footprint,
    work_work_distance_2d,
)
from app.models import (
    Asset,
    Point2,
    Point3,
    RecordMethod,
    SourcePermit,
    SourceRecord,
    Utility,
    Work,
    WorkType,
)


def approx(value: float) -> object:
    return pytest.approx(value, abs=1e-6)


def make_asset(
    path: list[Point3],
    diameter_m: float,
    utility: Utility = Utility.WATER,
    horiz_precision_m: float = 0.1,
) -> Asset:
    return Asset(
        id="AST-9001",
        utility=utility,
        owner="Test Dept",
        label="test asset",
        path=path,
        diameter_m=diameter_m,
        horiz_precision_m=horiz_precision_m,
        depth_precision_m=0.1,
        depth_known=True,
        source_record=SourceRecord(
            record_id="REC-1",
            source="test",
            captured_on=date(2020, 1, 1),
            method=RecordMethod.SURVEYED,
        ),
    )


def make_work(
    work_type: WorkType,
    path: list[Point2],
    *,
    width_m: float = 0.0,
    depth_from_m: float = 0.0,
    depth_to_m: float = 1.5,
    bore_path: list[Point3] | None = None,
    bore_diameter_m: float | None = None,
) -> Work:
    return Work(
        id="WRK-901",
        title="test work",
        agency="Test Agency",
        work_type=work_type,
        path=path,
        width_m=width_m,
        depth_from_m=depth_from_m,
        depth_to_m=depth_to_m,
        bore_path=bore_path,
        bore_diameter_m=bore_diameter_m,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 10),
        source_permit=SourcePermit(permit_no="P-1", source="test", submitted_on=date(2026, 10, 1)),
    )


def trench(depth_from_m: float = 0.0, depth_to_m: float = 1.5) -> Work:
    """x 0..10, y -1..1 footprint."""
    return make_work(
        WorkType.TRENCH,
        [(0.0, 0.0), (10.0, 0.0)],
        width_m=2.0,
        depth_from_m=depth_from_m,
        depth_to_m=depth_to_m,
    )


# ---------------------------------------------------------------- segments


def test_segment_crossing_with_vertical_offset() -> None:
    d, pa, pb = segment_distance((0, 0, 0), (10, 0, 0), (5, -5, 2), (5, 5, 2))
    assert d == approx(2.0)
    assert pa == pytest.approx((5, 0, 0), abs=1e-6)
    assert pb == pytest.approx((5, 0, 2), abs=1e-6)


def test_segment_parallel_offset_3_4_5() -> None:
    d, _, _ = segment_distance((0, 0, 0), (10, 0, 0), (0, 3, 4), (10, 3, 4))
    assert d == approx(5.0)  # sqrt(3² + 4²)


def test_segment_collinear_disjoint() -> None:
    d, pa, pb = segment_distance((0, 0, 0), (1, 0, 0), (4, 0, 0), (6, 0, 0))
    assert d == approx(3.0)
    assert pa == pytest.approx((1, 0, 0), abs=1e-6)
    assert pb == pytest.approx((4, 0, 0), abs=1e-6)


def test_segment_endpoint_to_endpoint() -> None:
    d, _, _ = segment_distance((0, 0, 0), (1, 0, 0), (1, 1, 0), (1, 5, 0))
    assert d == approx(1.0)


def test_segment_touching_is_zero() -> None:
    d, _, _ = segment_distance((0, 0, 0), (10, 0, 0), (5, -5, 0), (5, 5, 0))
    assert d == approx(0.0)


def test_segment_zero_length_point_to_segment() -> None:
    d, pa, _ = segment_distance((0, 0, 0), (0, 0, 0), (-5, 3, 0), (5, 3, 0))
    assert d == approx(3.0)
    assert pa == pytest.approx((0, 0, 0), abs=1e-6)


def test_segment_both_zero_length() -> None:
    d, _, _ = segment_distance((0, 0, 0), (0, 0, 0), (3, 4, 0), (3, 4, 0))
    assert d == approx(5.0)


def test_segment_distance_is_symmetric() -> None:
    a = ((0.0, 0.0, -1.0), (7.0, 2.0, -2.0))
    b = ((3.0, 5.0, -0.5), (6.0, -4.0, -3.0))
    assert segment_distance(*a, *b)[0] == approx(segment_distance(*b, *a)[0])


# ---------------------------------------------------------------- polylines


def test_polyline_min_taken_from_correct_segment() -> None:
    a = [(0.0, 0.0, 0.0), (10.0, 0.0, 0.0), (10.0, 10.0, 0.0)]
    b = [(12.0, 5.0, 0.0), (12.0, 15.0, 0.0)]
    r = polyline_distance(a, b)
    assert r.dist == approx(2.0)  # a's second leg (x = 10) vs b (x = 12)
    assert r.point_a == pytest.approx((10, 5, 0), abs=1e-6)
    assert r.point_b == pytest.approx((12, 5, 0), abs=1e-6)


def test_polyline_crossing_in_3d_is_zero() -> None:
    a = [(0.0, 0.0, -1.0), (10.0, 0.0, -1.0)]
    b = [(5.0, -3.0, -1.0), (5.0, 3.0, -1.0)]
    assert polyline_distance(a, b).dist == approx(0.0)


# ---------------------------------------------------------------- pipe gap


def test_pipe_gap_subtracts_both_radii() -> None:
    a = [(0.0, 0.0, -1.5), (10.0, 0.0, -1.5)]
    b = [(0.0, 1.2, -1.5), (10.0, 1.2, -1.5)]
    r = pipe_gap(a, 0.1, b, 0.055)
    assert r.gap == approx(1.045)  # 1.2 - 0.1 - 0.055
    assert r.location[1] == approx(0.6)
    assert r.location[2] == approx(-1.5)


def test_pipe_gap_overlap_is_negative() -> None:
    a = [(0.0, 0.0, -1.0), (10.0, 0.0, -1.0)]
    b = [(0.0, 0.1, -1.0), (10.0, 0.1, -1.0)]
    assert pipe_gap(a, 0.1, b, 0.1).gap == approx(-0.1)  # 0.1 - 0.2


# ---------------------------------------------------------------- depth_at


def test_depth_at_interpolates_midpoint() -> None:
    path = [(0.0, 0.0, -1.0), (10.0, 0.0, -2.0)]
    assert depth_at(path, (5.0, 3.0)) == approx(1.5)


def test_depth_at_clamps_beyond_end() -> None:
    path = [(0.0, 0.0, -1.0), (10.0, 0.0, -2.0)]
    assert depth_at(path, (20.0, 0.0)) == approx(2.0)


def test_depth_at_multi_segment_uses_nearest_leg() -> None:
    path = [(0.0, 0.0, -1.0), (10.0, 0.0, -1.0), (10.0, 10.0, -3.0)]
    assert depth_at(path, (10.0, 5.0)) == approx(2.0)


# ---------------------------------------------------------------- footprints


def test_trench_footprint_flat_caps() -> None:
    fp = work_footprint(trench())
    assert fp.area == approx(20.0)  # 10 × 2, flat caps
    assert fp.bounds == pytest.approx((0, -1, 10, 1), abs=1e-6)


def test_pit_footprint_is_the_ring() -> None:
    pit = make_work(WorkType.PIT, [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)], depth_to_m=2.0)
    assert work_footprint(pit).area == approx(12.0)


def test_hdd_footprint_uses_xy_projection_of_bore() -> None:
    hdd = make_work(
        WorkType.HDD,
        [(0.0, 0.0), (10.0, 0.0)],
        bore_path=[(0.0, 0.0, -1.5), (10.0, 0.0, -2.5)],
        bore_diameter_m=0.2,
    )
    fp = work_footprint(hdd)
    # rectangle + round caps; shapely approximates the arc with a polygon, so loosen the tolerance
    assert fp.area == pytest.approx(10 * 0.2 + math.pi * 0.1**2, abs=1e-3)
    assert fp.bounds[1] == approx(-0.1)


def test_pipe_lay_footprint_width_is_bore_diameter() -> None:
    pl = make_work(
        WorkType.PIPE_LAY, [(0.0, 0.0), (10.0, 0.0)], depth_to_m=1.6, bore_diameter_m=0.4
    )
    fp = work_footprint(pl)
    assert fp.bounds[1] == approx(-0.2)
    assert fp.bounds[3] == approx(0.2)


def test_asset_footprint_buffer_is_radius_precision_margin() -> None:
    a = make_asset([(0.0, 0.0, -1.0), (10.0, 0.0, -1.0)], 0.3, horiz_precision_m=0.2)
    fp = asset_footprint(a)
    assert fp.bounds[3] == approx(0.15 + 0.2 + ASSET_FOOTPRINT_MARGIN_M)


def test_margins_match_spec() -> None:
    assert ASSET_FOOTPRINT_MARGIN_M == 1.5
    assert SEARCH_MARGIN_M == 1.5


# ---------------------------------------------------------------- centreline


def test_pipe_lay_centreline_depth_is_depth_to_minus_radius() -> None:
    pl = make_work(
        WorkType.PIPE_LAY, [(0.0, 0.0), (10.0, 0.0)], depth_to_m=1.6, bore_diameter_m=0.2
    )
    assert pipe_work_centreline(pl) == [(0.0, 0.0, -1.5), (10.0, 0.0, -1.5)]


def test_hdd_centreline_is_bore_path() -> None:
    bore: list[Point3] = [(0.0, 0.0, -1.5), (10.0, 0.0, -2.0)]
    hdd = make_work(WorkType.HDD, [(0.0, 0.0), (10.0, 0.0)], bore_path=bore, bore_diameter_m=0.2)
    assert pipe_work_centreline(hdd) == bore


def test_hdd_without_bore_path_raises() -> None:
    hdd = make_work(WorkType.HDD, [(0.0, 0.0), (10.0, 0.0)], bore_diameter_m=0.2)
    with pytest.raises(ValueError):
        pipe_work_centreline(hdd)


def test_pipe_lay_without_diameter_raises() -> None:
    pl = make_work(WorkType.PIPE_LAY, [(0.0, 0.0), (10.0, 0.0)], depth_to_m=1.6)
    with pytest.raises(ValueError):
        pipe_work_centreline(pl)


# ---------------------------------------------------------------- excavation gap


def test_excavation_asset_crosses_above_floor_is_negative() -> None:
    # T1-like: gas 0.2 m at 1.0 m depth → top 0.9; floor 1.5 → 0.9 - 1.5
    gas = make_asset([(5.0, -5.0, -1.0), (5.0, 5.0, -1.0)], 0.2, Utility.GAS)
    r = excavation_gap(trench(), gas)
    assert r.gap == approx(-0.6)
    assert r.location[0] == approx(5.0)
    assert r.location[2] == approx(-1.0)


def test_excavation_asset_deep_below_floor_is_positive() -> None:
    # T4-like: sewer 0.6 m at 4.2 m → top 3.9; 3.9 - 1.5
    sewer = make_asset([(5.0, -5.0, -4.2), (5.0, 5.0, -4.2)], 0.6, Utility.SEWER)
    assert excavation_gap(trench(), sewer).gap == approx(2.4)


def test_excavation_beside_at_overlapping_depth_gap_is_horizontal() -> None:
    # asset along y = 3, r = 0.1: footprint edge y = 1 → 2.0 - 0.1; bands overlap → v = 0
    a = make_asset([(0.0, 3.0, -1.0), (10.0, 3.0, -1.0)], 0.2)
    assert excavation_gap(trench(), a).gap == approx(1.9)


def test_excavation_beside_and_deeper_combines_h_and_v() -> None:
    # y = 4.1, r = 0.1 → h = 4.1 - 1 - 0.1 = 3.0; depth 5.6 → top 5.5; v = 5.5 - 1.5 = 4.0
    a = make_asset([(0.0, 4.1, -5.6), (10.0, 4.1, -5.6)], 0.2)
    assert excavation_gap(trench(), a).gap == approx(5.0)  # 3-4-5


def test_excavation_asset_runs_under_footprint_floor() -> None:
    # parallel inside the footprint at 3.0 m, d = 0.4 → top 2.8; 2.8 - 1.5
    a = make_asset([(0.0, 0.0, -3.0), (10.0, 0.0, -3.0)], 0.4)
    assert excavation_gap(trench(), a).gap == approx(1.3)


def test_excavation_h_nonpositive_only_through_radius() -> None:
    # centreline y = 1.1 is 0.1 outside the footprint; r = 0.2 → h = -0.1 → under/through
    a = make_asset([(0.0, 1.1, -1.0), (10.0, 1.1, -1.0)], 0.4)
    r = excavation_gap(trench(), a)
    assert r.gap == approx(-0.7)  # top 0.8 - 1.5


def test_excavation_pit_polygon() -> None:
    pit = make_work(WorkType.PIT, [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)], depth_to_m=2.0)
    a = make_asset([(2.0, -2.0, -1.0), (2.0, 5.0, -1.0)], 0.2)
    assert excavation_gap(pit, a).gap == approx(-1.1)  # 0.9 - 2.0


def test_excavation_sloped_asset_uses_shallowest_depth_inside_footprint() -> None:
    # Asset runs along y from -5 (z -1.0) to +5 (z -3.0): z(y) = -2 - 0.2·y.
    # Footprint is y ∈ [-1, 1] → depth inside spans 1.8 (y = -1) .. 2.2 (y = +1).
    # Shallowest inside = 1.8 → top 1.7 (r 0.1) → 1.7 - 1.5 = 0.2.
    # (centre of footprint would give 0.4; the deep end 0.6 — so only the
    #  shallowest-inside rule yields 0.2.)
    a = make_asset([(5.0, -5.0, -1.0), (5.0, 5.0, -3.0)], 0.2)
    r = excavation_gap(trench(), a)
    assert r.gap == approx(0.2)
    assert r.location == pytest.approx((5.0, -1.0, -1.8), abs=1e-6)


def test_excavation_sloped_asset_is_direction_independent() -> None:
    a = make_asset([(5.0, 5.0, -3.0), (5.0, -5.0, -1.0)], 0.2)  # reversed
    r = excavation_gap(trench(), a)
    assert r.gap == approx(0.2)
    assert r.location == pytest.approx((5.0, -1.0, -1.8), abs=1e-6)


def test_excavation_asset_above_floor_start_is_vertically_separated() -> None:
    # Decision 2: excavation band 1.0–2.0 m; asset 0.5 m deep, d 0.2 → bottom 0.6
    pit = make_work(
        WorkType.PIT,
        [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)],
        depth_from_m=1.0,
        depth_to_m=2.0,
    )
    a = make_asset([(2.0, -2.0, -0.5), (2.0, 5.0, -0.5)], 0.2)
    assert excavation_gap(pit, a).gap == approx(0.4)  # 1.0 - 0.6


def test_excavation_asset_inside_excavation_band_uses_spec_formula() -> None:
    pit = make_work(
        WorkType.PIT,
        [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)],
        depth_from_m=1.0,
        depth_to_m=2.0,
    )
    a = make_asset([(2.0, -2.0, -1.5), (2.0, 5.0, -1.5)], 0.2)
    assert excavation_gap(pit, a).gap == approx(-0.6)  # top 1.4 - 2.0


# ---------------------------------------------------------------- dispatcher


def test_work_asset_gap_trench_delegates_to_excavation() -> None:
    gas = make_asset([(5.0, -5.0, -1.0), (5.0, 5.0, -1.0)], 0.2, Utility.GAS)
    assert work_asset_gap(trench(), gas).gap == approx(-0.6)


def test_work_asset_gap_hdd_alongside_cable() -> None:
    hdd = make_work(
        WorkType.HDD,
        [(0.0, 0.0), (10.0, 0.0)],
        bore_path=[(0.0, 0.0, -1.5), (10.0, 0.0, -1.5)],
        bore_diameter_m=0.2,
    )
    cable = make_asset([(0.0, 0.355, -1.5), (10.0, 0.355, -1.5)], 0.15, Utility.POWER)
    assert work_asset_gap(hdd, cable).gap == approx(0.18)  # 0.355 - 0.1 - 0.075


def test_work_asset_gap_pipe_lay_parallel_telecom() -> None:
    pl = make_work(
        WorkType.PIPE_LAY,
        [(0.0, 0.0), (10.0, 0.0)],
        depth_to_m=1.6,
        bore_diameter_m=0.2,
    )
    duct = make_asset([(0.0, 1.2, -1.5), (10.0, 1.2, -1.5)], 0.11, Utility.TELECOM)
    assert work_asset_gap(pl, duct).gap == approx(1.045)  # 1.2 - 0.1 - 0.055


def test_work_asset_gap_is_deterministic() -> None:
    gas = make_asset([(5.0, -5.0, -1.0), (5.0, 5.0, -3.0)], 0.2, Utility.GAS)
    assert work_asset_gap(trench(), gas) == work_asset_gap(trench(), gas)


# ---------------------------------------------------------------- work vs work


def test_work_work_distance_between_parallel_trenches() -> None:
    other = make_work(WorkType.TRENCH, [(0.0, 6.0), (10.0, 6.0)], width_m=2.0)
    assert work_work_distance_2d(trench(), other) == approx(4.0)  # y 1 → 5


def test_work_work_distance_overlapping_is_zero() -> None:
    other = make_work(WorkType.TRENCH, [(5.0, -3.0), (5.0, 3.0)], width_m=2.0)
    assert work_work_distance_2d(trench(), other) == approx(0.0)


# ---------------------------------------------------------------- seed cross-check


@pytest.fixture(scope="module")
def seed_gaps() -> dict[str, float]:
    scene = load_scene()
    assets = {a.id: a for a in scene.assets}
    works = {w.id: w for w in scene.works}
    out: dict[str, float] = {}
    for case in load_truth():
        if case.asset_id is not None:
            out[case.case_id] = work_asset_gap(works[case.work_id], assets[case.asset_id]).gap
    return out


@pytest.mark.parametrize(
    ("case", "expected"),
    [("T1", -0.6), ("T2", 0.18), ("T3", 1.045), ("T4", 2.4), ("T5", 0.2)],
)
def test_seed_planted_cases_match_spec_gaps(
    seed_gaps: dict[str, float], case: str, expected: float
) -> None:
    assert seed_gaps[case] == pytest.approx(expected, abs=1e-6)
