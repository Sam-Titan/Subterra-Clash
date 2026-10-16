"""Grouping + ranking on hand-built clashes (real seed streets)."""

from app.data.loader import load_scene
from app.engine.grouping import group_clashes, nearest_street_id
from app.models import (
    Band,
    Certainty,
    Clash,
    ClashKind,
    Location,
    Severity,
    SeverityFactors,
)

SCENE = load_scene()


def clash(
    cid: str, works: list[str], x: float, y: float, score: int, band: Band = Band.HIGH
) -> Clash:
    return Clash(
        id=cid,
        kind=ClashKind.CLEARANCE,
        certainty=Certainty.LIKELY,
        severity=Severity(
            score=score,
            band=band,
            factors=SeverityFactors(hazard=0.5, breach=0.5, urgency=0.5, confidence=1.0),
        ),
        work_ids=works,
        location=Location(x=x, y=y, z=-1.0),
        explanation="x",
        group_id="GRP-00",
        baseline_flagged=False,
    )


def run(clashes: list[Clash]):  # type: ignore[no-untyped-def]
    return group_clashes(clashes, SCENE.works, SCENE.streets)


def test_nearest_street() -> None:
    assert nearest_street_id(100, 202, SCENE.streets) == "ST-01"  # Station Road y=200
    assert nearest_street_id(176, 206, SCENE.streets) == "ST-02"  # 4 m from Vikas Marg x=180


def test_shared_work_joins_clashes_even_far_apart() -> None:
    out, groups = run(
        [clash("CLH-0001", ["WRK-001"], 10, 200, 50), clash("CLH-0002", ["WRK-001"], 500, 80, 40)]
    )
    assert len(groups) == 1
    assert {c.group_id for c in out} == {"GRP-01"}
    assert groups[0].work_ids == ["WRK-001"]


def test_within_15m_on_same_street_joins() -> None:
    _, groups = run(
        [clash("CLH-0001", ["WRK-001"], 100, 201, 50), clash("CLH-0002", ["WRK-002"], 114, 201, 40)]
    )
    assert len(groups) == 1  # 14 m apart, both Station Road


def test_30m_apart_on_same_street_stays_separate() -> None:
    _, groups = run(
        [clash("CLH-0001", ["WRK-001"], 100, 201, 50), clash("CLH-0002", ["WRK-002"], 130, 201, 40)]
    )
    assert len(groups) == 2


def test_close_but_different_streets_stays_separate() -> None:
    # (176,206) is on Vikas Marg, (185,197) on Station Road; 12.7 m apart
    _, groups = run(
        [clash("CLH-0001", ["WRK-001"], 176, 206, 50), clash("CLH-0002", ["WRK-002"], 185, 197, 40)]
    )
    assert len(groups) == 2


def test_rank_by_max_severity_then_clash_count_then_id() -> None:
    clashes = [
        clash("CLH-0001", ["WRK-001"], 100, 200, 50),  # GRP-01 score 50
        clash("CLH-0002", ["WRK-002"], 300, 80, 90),  # GRP-02 score 90, 1 clash
        clash("CLH-0003", ["WRK-003"], 450, 320, 90),  # GRP-03 score 90 ...
        clash("CLH-0004", ["WRK-003"], 560, 320, 10),  # ... 2 clashes (shared work)
    ]
    out, groups = run(clashes)
    rank = {g.id: g.review_rank for g in groups}
    assert rank == {"GRP-03": 1, "GRP-02": 2, "GRP-01": 3}
    assert {c.id: c.group_id for c in out}["CLH-0004"] == "GRP-03"


def test_group_ids_follow_smallest_clash_id_and_inputs_untouched() -> None:
    clashes = [
        clash("CLH-0007", ["WRK-001"], 100, 200, 50),
        clash("CLH-0002", ["WRK-002"], 300, 80, 40),
    ]
    out, groups = run(clashes)
    assert [g.id for g in groups] == ["GRP-01", "GRP-02"]
    assert groups[0].clash_ids == ["CLH-0002"]
    assert all(c.group_id == "GRP-00" for c in clashes)
    assert [c.id for c in out] == ["CLH-0002", "CLH-0007"]


def test_title_uses_top_severity_work_and_count() -> None:
    _, groups = run(
        [clash("CLH-0001", ["WRK-004"], 100, 200, 30), clash("CLH-0002", ["WRK-001"], 105, 200, 80)]
    )
    title = next(w.title for w in SCENE.works if w.id == "WRK-001")
    assert groups[0].title == f"{title} — 2 clashes, highest HIGH"


def test_info_only_groups_rank_after_every_conflict_group() -> None:
    clashes = [
        clash("CLH-0001", ["WRK-001"], 100, 200, 65, Band.INFO),  # dig-once, score 65
        clash("CLH-0002", ["WRK-002"], 300, 80, 57),  # HIGH 57
        clash("CLH-0003", ["WRK-003"], 450, 320, 20, Band.LOW),  # conflict, low score
    ]
    _, groups = run(clashes)
    rank = {g.id: g.review_rank for g in groups}
    assert rank == {"GRP-02": 1, "GRP-03": 2, "GRP-01": 3}


def test_group_with_one_conflict_is_not_info_only() -> None:
    clashes = [
        clash("CLH-0001", ["WRK-001"], 100, 200, 65, Band.INFO),
        clash("CLH-0002", ["WRK-001"], 500, 80, 30, Band.MEDIUM),  # shares work → same group
        clash("CLH-0003", ["WRK-003"], 450, 320, 20, Band.LOW),
    ]
    _, groups = run(clashes)
    rank = {g.id: g.review_rank for g in groups}
    assert rank == {"GRP-01": 1, "GRP-02": 2}


def test_seed_info_only_groups_rank_last() -> None:
    from app.config import get_settings
    from app.data.loader import load_rules
    from app.engine.analyze import analyze

    result = analyze(SCENE, load_rules(), get_settings().demo_date)
    band_of = {c.id: c.severity.band for c in result.clashes}
    info_only = [g for g in result.groups if all(band_of[c] is Band.INFO for c in g.clash_ids)]
    assert info_only, "seed should contain at least one dig-once (INFO) group"
    n = len(result.groups)
    assert sorted(g.review_rank for g in info_only) == list(range(n - len(info_only) + 1, n + 1))
