"""Naive 2D baseline: footprint polygon meets the asset centreline, nothing else."""

from factories import make_asset, make_work

from app.engine.baseline import baseline_pairs
from app.models import WorkType


def test_crossing_flagged_even_when_far_below() -> None:
    deep = make_asset([(5, -5, -9.0), (5, 5, -9.0)], id="AST-0001")  # depth ignored
    assert baseline_pairs([make_work()], [deep]) == {("WRK-901", "AST-0001")}


def test_parallel_near_miss_is_not_flagged() -> None:
    # asset at y=1.2, footprint edge at y=1: no 2D intersection (misses the real clearance breach)
    near = make_asset([(0, 1.2, -1.0), (10, 1.2, -1.0)])
    assert baseline_pairs([make_work()], [near]) == set()


def test_hdd_uses_2d_projection_of_bore() -> None:
    hdd = make_work(
        WorkType.HDD,
        bore_path=[(0, 0, -1.0), (10, 0, -1.0)],
        bore_diameter_m=0.2,
        depth_from_m=0.9,
        depth_to_m=1.1,
    )
    cross = make_asset([(5, -5, -3.0), (5, 5, -3.0)], id="AST-0002")
    assert baseline_pairs([hdd], [cross]) == {("WRK-901", "AST-0002")}
