"""Dashboard summary: unresolved counts + ours-vs-baseline evaluation (SPEC §8.7)."""

from collections import Counter
from collections.abc import Sequence

from app.engine.baseline import Score, evaluate
from app.models import Asset, Band, Certainty, Clash, ClashKind, ReviewStatus, TruthCase
from app.models.summary import (
    CertaintyCount,
    EvalCase,
    EvalScore,
    Evaluation,
    Summary,
    SummaryCounts,
    UtilityCount,
)

NO_CLASH = "NO_CLASH"
UNRESOLVED = (ReviewStatus.OPEN, ReviewStatus.ESCALATED)


def _score(s: Score) -> EvalScore:
    return EvalScore(
        true_positives=s.found,
        false_alarms=s.false_alarms,
        misses=s.misses,
        precision=s.precision,
        recall=s.recall,
    )


def build_summary(
    clashes: Sequence[Clash],
    assets: Sequence[Asset],
    truth: Sequence[TruthCase],
    base: set[tuple[str, str]],
) -> Summary:
    """Counts cover unresolved (OPEN + ESCALATED) clashes; evaluation uses all engine output."""
    unresolved = [c for c in clashes if c.review.status in UNRESOLVED]
    utility_of = {a.id: a.utility for a in assets}

    counts = SummaryCounts(
        open=len(unresolved),
        critical=sum(c.severity.band is Band.CRITICAL for c in unresolved),
        high=sum(c.severity.band is Band.HIGH for c in unresolved),
        needs_data=sum(c.certainty is Certainty.NEEDS_DATA for c in unresolved),
        dig_once=sum(c.kind is ClashKind.DIG_ONCE for c in unresolved),
        schedule_overlap=sum(c.kind is ClashKind.SCHEDULE_OVERLAP for c in unresolved),
    )

    per_utility: Counter[str] = Counter()
    for c in unresolved:
        per_utility.update({utility_of[a] for a in c.asset_ids if a in utility_of})
    per_certainty = Counter(c.certainty for c in unresolved)

    ev = evaluate(truth, clashes, base)
    expected = {t.case_id: t.expected for t in truth}
    cases = [
        EvalCase(
            case_id=r.case_id,
            description=r.description,
            expected=exp.kind.value if (exp := expected[r.case_id]).kind else NO_CLASH,
            expected_certainty=exp.certainty,
            ours=r.ours_kind.value if r.ours_kind else NO_CLASH,
            ours_certainty=r.ours_certainty,
            baseline="FLAGGED" if r.baseline_flagged else "NOT_FLAGGED",
        )
        for r in ev.cases
    ]
    return Summary(
        counts=counts,
        by_utility=[UtilityCount(utility=u, count=n) for u, n in sorted(per_utility.items())],
        by_certainty=[
            CertaintyCount(certainty=k, count=per_certainty[k])
            for k in Certainty
            if per_certainty[k]
        ],
        evaluation=Evaluation(ours=_score(ev.ours), baseline=_score(ev.baseline), cases=cases),
    )
