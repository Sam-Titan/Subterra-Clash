"""Summary counts + evaluation (SPEC §8.7) and explanation wording for every kind x certainty."""

import itertools
import re

import pytest

from app.engine.detect import SpatialFinding
from app.engine.explain import schedule_explanation, spatial_explanation
from app.engine.schedule import ScheduleFinding
from app.models import Certainty, ClashKind, Rule, RuleAppliesTo
from tests.factories import make_asset, make_work

FORBIDDEN = re.compile(r"\b(approv\w*|reject\w*|denied|deny)\b", re.IGNORECASE)
RULE = Rule(
    id="R-TEST",
    applies_to=RuleAppliesTo(work_types=[], utility=[], work_utility=[]),
    min_clearance_m=0.6,
    label="Test clearance",
)


def _spatial(kind: ClashKind, certainty: Certainty, missing: tuple[str, ...]) -> SpatialFinding:
    needs = certainty is Certainty.NEEDS_DATA
    return SpatialFinding(
        work=make_work(),
        asset=make_asset([(0.0, 0.0, -1.0), (10.0, 0.0, -1.0)]),
        rule=RULE,
        kind=kind,
        certainty=certainty,
        gap_m=None if needs else (-0.45 if kind is ClashKind.INTERSECTION else 0.18),
        required_m=0.6,
        uncertainty_m=None if needs else 0.28,
        location=(5.0, 0.0, -1.0),
        missing_data=missing,
    )


SPATIAL_CASES = [
    (k, c, ())
    for k, c in itertools.product(
        (ClashKind.INTERSECTION, ClashKind.CLEARANCE), (Certainty.LIKELY, Certainty.POSSIBLE)
    )
] + [
    (k, Certainty.NEEDS_DATA, m)
    for k in (ClashKind.INTERSECTION, ClashKind.CLEARANCE)
    for m in (("WRK-901.depth",), ("AST-9001.depth",), ("WRK-901.depth", "AST-9001.depth"))
]


@pytest.mark.parametrize(("kind", "certainty", "missing"), SPATIAL_CASES)
def test_spatial_explanation_cites_numbers_and_rule(kind, certainty, missing) -> None:  # type: ignore[no-untyped-def]
    f = _spatial(kind, certainty, missing)
    text = spatial_explanation(f)
    assert "R-TEST" in text
    assert "0.60 m" in text
    assert not FORBIDDEN.search(text)
    if certainty is Certainty.NEEDS_DATA:
        assert "confirmed" in text or "surveyed" in text
        assert "-0." not in text  # no invented gap
    else:
        assert "±0.28 m" in text
        assert ("0.45 m of overlap" if kind is ClashKind.INTERSECTION else "0.18 m to") in text


@pytest.mark.parametrize("kind", [ClashKind.SCHEDULE_OVERLAP, ClashKind.DIG_ONCE])
def test_schedule_explanation_cites_days(kind: ClashKind) -> None:
    f = ScheduleFinding(
        kind=kind,
        work_a=make_work(id="WRK-901"),
        work_b=make_work(id="WRK-902"),
        overlap_days=4,
        gap_days=45,
        location=(0.0, 0.0, 0.0),
    )
    text = schedule_explanation(f)
    assert ("4 days" if kind is ClashKind.SCHEDULE_OVERLAP else "45 days") in text
    assert "WRK-901" in text and "WRK-902" in text
    assert not FORBIDDEN.search(text)
