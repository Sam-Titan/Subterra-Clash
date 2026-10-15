"""Detection + certainty. Trench footprint is x 0..10, y -1..1, depth 0..1.5 m (width 2)."""

import pytest
from factories import make_asset, make_work

from app.data.loader import load_rules
from app.engine.detect import classify, detect_spatial, plausible_depths
from app.engine.rules import find_rule
from app.models import Certainty, ClashKind, Utility, WorkType

RULES = load_rules()


def approx(v: float) -> object:
    return pytest.approx(v, abs=1e-6)


# classify: required 0.6, u 0.28 -> LIKELY below 0.32, POSSIBLE 0.32..0.88, none from 0.88
@pytest.mark.parametrize(
    ("gap", "expected"),
    [
        (-0.6, Certainty.LIKELY),
        (0.18, Certainty.LIKELY),
        (0.31, Certainty.LIKELY),
        (0.32, Certainty.POSSIBLE),
        (0.87, Certainty.POSSIBLE),
        (0.88, None),
        (5.0, None),
    ],
)
def test_classify_boundaries(gap: float, expected: Certainty | None) -> None:
    assert classify(gap, 0.6, 0.28) is expected


def test_crossing_asset_is_intersection_likely() -> None:
    # 0.3 m water main across the trench at 1.0 m depth: top 0.85, floor 1.5 -> gap -0.65
    asset = make_asset([(5, -5, -1.0), (5, 5, -1.0)])
    (f,) = detect_spatial([make_work()], [asset], RULES)
    assert f.kind is ClashKind.INTERSECTION
    assert f.certainty is Certainty.LIKELY
    assert f.gap_m == approx(-0.65)
    assert f.required_m == 0.3
    assert f.rule.id == "R-EXC-OTHER"
    assert f.uncertainty_m == approx(0.1414213562)  # sqrt(0.1² + 0.1²)


def test_parallel_asset_is_possible_clearance() -> None:
    # asset at y=1.4: h = (1.4 - 1.0) - 0.15 = 0.25; bands overlap -> gap 0.25
    # required 0.3, u 0.1414 -> 0.158 <= 0.25 < 0.441 -> POSSIBLE
    asset = make_asset([(0, 1.4, -1.0), (10, 1.4, -1.0)])
    (f,) = detect_spatial([make_work()], [asset], RULES)
    assert f.kind is ClashKind.CLEARANCE
    assert f.certainty is Certainty.POSSIBLE
    assert f.gap_m == approx(0.25)


def test_asset_beyond_required_plus_uncertainty_is_not_a_clash() -> None:
    # y=2.0 -> gap 0.85 >= 0.3 + 0.1414
    asset = make_asset([(0, 2.0, -1.0), (10, 2.0, -1.0)])
    assert detect_spatial([make_work()], [asset], RULES) == []


def test_deep_asset_under_trench_is_not_a_clash() -> None:
    # 0.6 m sewer at 4.2 m: top 3.9, floor 1.5 -> gap 2.4 (T4 shape)
    asset = make_asset([(5, -5, -4.2), (5, 5, -4.2)], 0.6, Utility.SEWER)
    assert detect_spatial([make_work()], [asset], RULES) == []


def test_work_uncertainty_widens_the_band() -> None:
    asset = make_asset([(0, 2.0, -1.0), (10, 2.0, -1.0)])  # gap 0.85
    (f,) = detect_spatial([make_work()], [asset], RULES, {"WRK-901": 1.0})
    assert f.certainty is Certainty.POSSIBLE  # u = sqrt(0.1414² + 1²) = 1.0099 -> 0.85 < 1.31
    assert f.uncertainty_m == approx(1.0099504938)


def test_unknown_depth_crossing_is_needs_data_without_a_gap() -> None:
    asset = make_asset(
        [(5, -5, -1.0), (5, 5, -1.0)], 0.2, Utility.POWER, depth_prec=None, depth_known=False
    )
    (f,) = detect_spatial([make_work()], [asset], RULES)
    assert f.certainty is Certainty.NEEDS_DATA
    assert f.kind is ClashKind.CLEARANCE
    assert f.gap_m is None
    assert f.uncertainty_m is None
    assert f.missing_data == ("AST-9001.depth",)
    assert f.required_m == 0.6  # rule is still reported


def test_depth_known_without_precision_is_treated_as_unknown() -> None:
    asset = make_asset([(5, -5, -1.0), (5, 5, -1.0)], depth_prec=None, depth_known=True)
    (f,) = detect_spatial([make_work()], [asset], RULES)
    assert f.certainty is Certainty.NEEDS_DATA


def test_unknown_depth_far_in_plan_cannot_violate_at_any_depth() -> None:
    # y=4: h = 3 - 0.15 = 2.85 >= 0.3 + 0.1 whatever the depth -> no clash
    asset = make_asset([(0, 4, -1.0), (10, 4, -1.0)], depth_prec=None, depth_known=False)
    assert detect_spatial([make_work()], [asset], RULES) == []


def test_plausible_depth_grid() -> None:
    d = plausible_depths()
    assert d[0] == 0.5
    assert d[-1] == 3.0
    assert len(d) == 26


def test_findings_are_sorted_by_work_then_asset() -> None:
    a1 = make_asset([(5, -5, -1.0), (5, 5, -1.0)], id="AST-0002")
    a2 = make_asset([(3, -5, -1.0), (3, 5, -1.0)], id="AST-0001")
    w2 = make_work(id="WRK-002")
    w1 = make_work(id="WRK-001")
    out = detect_spatial([w2, w1], [a1, a2], RULES)
    assert [(f.work.id, f.asset.id) for f in out] == [
        ("WRK-001", "AST-0001"),
        ("WRK-001", "AST-0002"),
        ("WRK-002", "AST-0001"),
        ("WRK-002", "AST-0002"),
    ]


# ------------------------------------------------------------- rule lookup


@pytest.mark.parametrize(
    ("work_type", "work_utility", "asset_utility", "rule_id"),
    [
        (WorkType.TRENCH, None, Utility.GAS, "R-EXC-GAS"),
        (WorkType.PIT, None, Utility.POWER, "R-EXC-POWER"),
        (WorkType.HDD, Utility.TELECOM, Utility.WATER, "R-EXC-OTHER"),
        (WorkType.PIPE_LAY, Utility.WATER, Utility.SEWER, "R-WATER-SEWER"),
        (WorkType.PIPE_LAY, Utility.TELECOM, Utility.GAS, "R-PIPE-GAS"),
        (WorkType.PIPE_LAY, Utility.WATER, Utility.POWER, "R-DEFAULT"),
        (WorkType.PIPE_LAY, Utility.WATER, Utility.WATER, "R-DEFAULT"),
        (WorkType.PIPE_LAY, None, Utility.SEWER, "R-DEFAULT"),  # no work utility -> not water
    ],
)
def test_find_rule(
    work_type: WorkType, work_utility: Utility | None, asset_utility: Utility, rule_id: str
) -> None:
    work = make_work(work_type, utility=work_utility)
    asset = make_asset([(0, 0, -1), (1, 0, -1)], utility=asset_utility)
    assert find_rule(RULES, work, asset).id == rule_id
