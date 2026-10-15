"""Explainable severity score (SPEC §8.5)."""

import math
from datetime import date

from app.models import Band, Certainty, ClashKind, Severity, SeverityFactors, Utility

HAZARD: dict[Utility, float] = {
    Utility.GAS: 1.0,
    Utility.POWER: 0.9,
    Utility.WATER: 0.6,
    Utility.SEWER: 0.55,
    Utility.TELECOM: 0.35,
}
SCHEDULE_HAZARD = 0.5
UNKNOWN_BREACH = 0.5
CONFIDENCE: dict[Certainty, float] = {
    Certainty.LIKELY: 1.0,
    Certainty.POSSIBLE: 0.6,
    Certainty.NEEDS_DATA: 0.4,
}


def urgency(start: date, today: date) -> float:
    days = (start - today).days
    if days <= 14:
        return 1.0
    if days <= 60:
        return 0.5
    return 0.2


def band_for(score: int, kind: ClashKind) -> Band:
    if kind is ClashKind.DIG_ONCE:
        return Band.INFO
    if score >= 75:
        return Band.CRITICAL
    if score >= 55:
        return Band.HIGH
    if score >= 35:
        return Band.MEDIUM
    return Band.LOW


def compute_severity(
    *,
    kind: ClashKind,
    certainty: Certainty,
    utility: Utility | None,
    gap_m: float | None,
    required_m: float | None,
    start: date,
    today: date,
) -> Severity:
    """``utility`` is the affected asset's; ``start`` the work's (earliest for schedule clashes)."""
    if kind in (ClashKind.SCHEDULE_OVERLAP, ClashKind.DIG_ONCE) or utility is None:
        hazard = SCHEDULE_HAZARD
        breach = UNKNOWN_BREACH
    else:
        hazard = HAZARD[utility]
        if gap_m is None or required_m is None:
            breach = UNKNOWN_BREACH
        else:
            breach = min(max((required_m - gap_m) / required_m, 0.0), 1.0)

    factors = SeverityFactors(
        hazard=hazard,
        breach=breach,
        urgency=urgency(start, today),
        confidence=CONFIDENCE[certainty],
    )
    raw = 100 * (
        0.40 * factors.hazard
        + 0.30 * factors.breach
        + 0.15 * factors.urgency
        + 0.15 * factors.confidence
    )
    score = math.floor(round(raw, 6) + 0.5)  # half-up; round() first absorbs float noise
    return Severity(score=score, band=band_for(score, kind), factors=factors)
