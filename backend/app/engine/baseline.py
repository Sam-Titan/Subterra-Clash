"""Naive 2D baseline (SPEC §8.6) and scoring against planted ground truth (SPEC §8.7)."""

from collections.abc import Sequence
from dataclasses import dataclass

from shapely.geometry import LineString

from app.engine.geometry import work_footprint
from app.models import (
    Asset,
    Band,
    Certainty,
    Clash,
    ClashKind,
    TruthCase,
    TruthCategory,
    TruthOutcome,
    Work,
)


def baseline_pairs(works: Sequence[Work], assets: Sequence[Asset]) -> set[tuple[str, str]]:
    """(work_id, asset_id) pairs where the footprint polygon meets the asset's 2D centreline.
    No depth, clearance, uncertainty or schedule."""
    lines = {a.id: LineString([(x, y) for x, y, _ in a.path]) for a in assets}
    pairs: set[tuple[str, str]] = set()
    for work in works:
        fp = work_footprint(work)
        pairs.update((work.id, aid) for aid, line in lines.items() if fp.intersects(line))
    return pairs


@dataclass(frozen=True)
class Score:
    found: int
    false_alarms: int
    misses: int
    precision: float
    recall: float


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    description: str
    category: TruthCategory
    expected: TruthOutcome
    ours_flagged: bool
    ours_kind: ClashKind | None
    ours_certainty: Certainty | None
    ours_band: Band | None
    baseline_flagged: bool
    passed: bool


@dataclass(frozen=True)
class Evaluation:
    ours: Score
    baseline: Score
    cases: list[CaseResult]


def _score(found: int, false_alarms: int, positives: int) -> Score:
    flagged = found + false_alarms
    return Score(
        found=found,
        false_alarms=false_alarms,
        misses=positives - found,
        precision=round(found / flagged, 2) if flagged else 1.0,
        recall=round(found / positives, 2) if positives else 1.0,
    )


def _matching(case: TruthCase, clashes: Sequence[Clash]) -> list[Clash]:
    if case.other_work_id is not None:
        return [
            c
            for c in clashes
            if case.work_id in c.work_ids
            and case.other_work_id in c.work_ids
            and c.kind in (ClashKind.SCHEDULE_OVERLAP, ClashKind.DIG_ONCE)
        ]
    if case.asset_id is not None:
        return [c for c in clashes if case.work_id in c.work_ids and case.asset_id in c.asset_ids]
    return [c for c in clashes if case.work_id in c.work_ids]


def evaluate(
    truth: Sequence[TruthCase], clashes: Sequence[Clash], base: set[tuple[str, str]]
) -> Evaluation:
    """Precision/recall over SPATIAL cases only; any certainty counts as found.
    Schedule cases are reported as pass/fail rows. Only pairs in ``truth`` are scored."""
    cases: list[CaseResult] = []
    tallies = {"ours": [0, 0, 0], "baseline": [0, 0, 0]}  # found, false alarms, positives

    for case in truth:
        hit = _matching(case, clashes)
        top = max(hit, key=lambda c: c.severity.score) if hit else None
        if case.asset_id is not None:
            base_hit = (case.work_id, case.asset_id) in base
        else:
            base_hit = any(w == case.work_id for w, _ in base)
        exp = case.expected

        passed = (top is not None) == (exp.outcome is TruthOutcome.CLASH)
        if passed and top is not None:
            passed = (
                (exp.kind is None or top.kind is exp.kind)
                and (exp.certainty is None or top.certainty is exp.certainty)
                and (exp.band is None or top.severity.band is exp.band)
            )
        cases.append(
            CaseResult(
                case_id=case.case_id,
                description=case.description,
                category=case.category,
                expected=exp.outcome,
                ours_flagged=top is not None,
                ours_kind=top.kind if top else None,
                ours_certainty=top.certainty if top else None,
                ours_band=top.severity.band if top else None,
                baseline_flagged=base_hit,
                passed=passed,
            )
        )

        if case.category is not TruthCategory.SPATIAL:
            continue
        positive = exp.outcome is TruthOutcome.CLASH
        for name, flagged in (("ours", top is not None), ("baseline", base_hit)):
            t = tallies[name]
            t[2] += positive
            if flagged:
                t[0 if positive else 1] += 1

    return Evaluation(
        ours=_score(*tallies["ours"][:2], tallies["ours"][2]),
        baseline=_score(*tallies["baseline"][:2], tallies["baseline"][2]),
        cases=cases,
    )
