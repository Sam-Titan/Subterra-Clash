import math
from datetime import timedelta

import pytest
from shapely.geometry import LineString, Polygon

from app.data.generator import build
from app.data.loader import load_scene, load_truth
from app.models import Asset, RecordMethod, Scene, TruthCase, Utility, Work, WorkType


@pytest.fixture(scope="module")
def seed() -> tuple[Scene, dict[str, TruthCase]]:
    scene, truth = build()
    return scene, {c.case_id: c for c in truth}


def _asset(scene: Scene, truth: dict[str, TruthCase], case: str) -> Asset:
    return next(a for a in scene.assets if a.id == truth[case].asset_id)


def _work(scene: Scene, work_id: str | None) -> Work:
    return next(w for w in scene.works if w.id == work_id)


def _centreline(a: Asset) -> LineString:
    return LineString([(x, y) for x, y, _ in a.path])


def _footprint(w: Work):  # noqa: ANN202
    if w.work_type is WorkType.PIT:
        return Polygon(w.path)
    if w.work_type is WorkType.TRENCH:
        return LineString(w.path).buffer(w.width_m / 2)
    if w.work_type is WorkType.HDD:
        assert w.bore_path and w.bore_diameter_m
        return LineString([(x, y) for x, y, _ in w.bore_path]).buffer(w.bore_diameter_m / 2)
    assert w.bore_diameter_m
    return LineString(w.path).buffer(w.bore_diameter_m / 2)


def _depth(a: Asset) -> float:
    return -a.path[0][2]


# --- structure -----------------------------------------------------------------------


def test_deterministic_and_committed_seed_is_current(
    seed: tuple[Scene, dict[str, TruthCase]],
) -> None:
    scene, truth = seed
    again, again_truth = build()
    assert again.model_dump(mode="json") == scene.model_dump(mode="json")
    assert [c.model_dump(mode="json") for c in again_truth] == [
        c.model_dump(mode="json") for c in truth.values()
    ]
    # seed JSON on disk equals a fresh build (run `python -m app.data.generator` if this fails)
    assert load_scene().model_dump(mode="json") == scene.model_dump(mode="json")
    assert {c.case_id: c.model_dump(mode="json") for c in load_truth()} == {
        k: c.model_dump(mode="json") for k, c in truth.items()
    }


def test_counts_utilities_and_ids(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, _ = seed
    assert 60 <= len(scene.assets) <= 120
    assert 8 <= len(scene.works) <= 12
    assert {a.utility for a in scene.assets} == set(Utility)
    assert len({a.id for a in scene.assets}) == len(scene.assets)
    assert len({w.id for w in scene.works}) == len(scene.works)
    assert len({a.source_record.record_id for a in scene.assets}) == len(scene.assets)


def test_everything_inside_bounds(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, _ = seed
    b = scene.area.bounds
    pts = [p[:2] for a in scene.assets for p in a.path] + [p for w in scene.works for p in w.path]
    assert all(b.min_x <= x <= b.max_x and b.min_y <= y <= b.max_y for x, y in pts)


def test_lanes_sewers_deepest_underground(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, _ = seed
    sewers = [_depth(a) for a in scene.assets if a.utility is Utility.SEWER]
    others = [_depth(a) for a in scene.assets if a.utility is not Utility.SEWER]
    assert min(sewers) >= 3.5
    assert max(others) <= 1.6
    assert all(a.path[0][2] == a.path[1][2] < 0 for a in scene.assets)


def test_truth_references_exist_and_cover_t1_to_t9(
    seed: tuple[Scene, dict[str, TruthCase]],
) -> None:
    scene, truth = seed
    assert set(truth) == {f"T{i}" for i in range(1, 10)}
    asset_ids = {a.id for a in scene.assets}
    work_ids = {w.id for w in scene.works}
    for c in truth.values():
        assert c.work_id in work_ids
        assert c.asset_id is None or c.asset_id in asset_ids
        assert c.other_work_id is None or c.other_work_id in work_ids
    planted = [truth[f"T{i}"].asset_id for i in range(1, 7)]
    assert len(set(planted)) == 6  # each spatial case owns a dedicated asset


# --- planted cases: exact SPEC §8.7 values -------------------------------------------


def test_t1_trench_through_gas(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T1"), _work(scene, truth["T1"].work_id)
    assert a.utility is Utility.GAS and a.diameter_m == 0.2
    assert _depth(a) == 1.0 and a.depth_known
    assert (a.horiz_precision_m, a.depth_precision_m) == (0.2, 0.2)
    assert a.source_record.method is RecordMethod.SURVEYED
    assert (w.work_type, w.depth_from_m, w.depth_to_m) == (WorkType.TRENCH, 0.0, 1.5)
    assert _centreline(a).crosses(LineString(w.path))
    assert (_depth(a) - a.diameter_m / 2) - w.depth_to_m == pytest.approx(-0.6)


def test_t2_hdd_beside_power(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T2"), _work(scene, truth["T2"].work_id)
    assert a.utility is Utility.POWER and a.diameter_m == 0.15
    assert (a.horiz_precision_m, a.depth_precision_m) == (0.2, 0.2)
    assert w.work_type is WorkType.HDD and w.bore_diameter_m == 0.2 and w.bore_path
    assert {p[2] for p in w.bore_path} == {a.path[0][2]}  # same depth
    bore = LineString([(x, y) for x, y, _ in w.bore_path])
    centres = bore.distance(_centreline(a))
    assert centres - 0.1 - 0.075 == pytest.approx(0.18)
    assert not _footprint(w).intersects(_centreline(a))


def test_t3_pipe_beside_digitised_duct(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T3"), _work(scene, truth["T3"].work_id)
    assert a.utility is Utility.TELECOM and a.diameter_m == 0.11
    assert (a.horiz_precision_m, a.depth_precision_m) == (2.0, 0.5)
    assert a.source_record.method is RecordMethod.DIGITISED
    assert (w.work_type, w.utility, w.bore_diameter_m) == (WorkType.PIPE_LAY, Utility.WATER, 0.2)
    assert w.depth_to_m - w.bore_diameter_m / 2 == pytest.approx(_depth(a))  # same depth
    centres = LineString(w.path).distance(_centreline(a))
    assert centres == pytest.approx(1.2)
    assert centres - 0.1 - 0.055 == pytest.approx(1.045)
    assert math.hypot(2.0, 0.5) == pytest.approx(2.06, abs=0.01)
    assert not _footprint(w).intersects(_centreline(a))


def test_t4_trench_over_deep_sewer(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T4"), _work(scene, truth["T4"].work_id)
    assert a.utility is Utility.SEWER and a.diameter_m == 0.6 and _depth(a) == 4.2
    assert (a.horiz_precision_m, a.depth_precision_m) == (0.25, 0.3)
    assert (w.work_type, w.depth_from_m, w.depth_to_m) == (WorkType.TRENCH, 0.0, 1.5)
    assert _centreline(a).crosses(LineString(w.path))
    assert (_depth(a) - 0.3) - w.depth_to_m == pytest.approx(2.4)


def test_t5_pipe_beside_surveyed_main(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T5"), _work(scene, truth["T5"].work_id)
    assert a.utility is Utility.WATER and a.diameter_m == 0.3
    assert (a.horiz_precision_m, a.depth_precision_m) == (0.05, 0.05)
    assert a.source_record.method is RecordMethod.SURVEYED
    assert (w.work_type, w.utility, w.bore_diameter_m) == (WorkType.PIPE_LAY, Utility.WATER, 0.2)
    assert w.depth_to_m - w.bore_diameter_m / 2 == pytest.approx(_depth(a))
    centres = LineString(w.path).distance(_centreline(a))
    assert centres == pytest.approx(0.45)
    assert centres - 0.1 - 0.15 == pytest.approx(0.2)
    assert not _footprint(w).intersects(_centreline(a))


def test_t6_pit_over_cable_with_unknown_depth(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, w = _asset(scene, truth, "T6"), _work(scene, truth["T6"].work_id)
    assert a.utility is Utility.POWER
    assert a.depth_known is False and a.depth_precision_m is None
    assert (w.work_type, w.depth_from_m, w.depth_to_m) == (WorkType.PIT, 0.0, 2.0)
    assert _footprint(w).intersects(_centreline(a))


def test_t7_overlapping_dates_within_5m(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, b = _work(scene, truth["T7"].work_id), _work(scene, truth["T7"].other_work_id)
    assert _footprint(a).distance(_footprint(b)) < 5
    assert a.start_date <= b.end_date and b.start_date <= a.end_date
    assert truth["T7"].expected.baseline_flagged is False


def test_t8_dig_once_45_days_apart_within_5m(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    a, b = _work(scene, truth["T8"].work_id), _work(scene, truth["T8"].other_work_id)
    assert _footprint(a).distance(_footprint(b)) < 5
    assert b.start_date - a.end_date == timedelta(days=45)


def test_t9_trench_far_from_everything(seed: tuple[Scene, dict[str, TruthCase]]) -> None:
    scene, truth = seed
    w = _work(scene, truth["T9"].work_id)
    fp = _footprint(w)
    assert w.work_type is WorkType.TRENCH
    assert all(fp.distance(_centreline(a)) > 10 for a in scene.assets)
    assert all(fp.distance(_footprint(o)) > 10 for o in scene.works if o.id != w.id)


def test_baseline_expectations_match_plan_intersection(
    seed: tuple[Scene, dict[str, TruthCase]],
) -> None:
    """Naive 2D overlay: flags T1, T4, T6; misses T2, T3, T5 (SPEC §8.7)."""
    scene, truth = seed
    flagged = {}
    for case in ("T1", "T2", "T3", "T4", "T5", "T6"):
        a, w = _asset(scene, truth, case), _work(scene, truth[case].work_id)
        flagged[case] = bool(_footprint(w).intersects(_centreline(a)))
        assert flagged[case] == truth[case].expected.baseline_flagged, case
    assert [k for k, v in flagged.items() if v] == ["T1", "T4", "T6"]
