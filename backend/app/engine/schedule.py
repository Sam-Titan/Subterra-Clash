"""Schedule clashes between works close in plan (SPEC §8.4)."""

from collections.abc import Sequence
from dataclasses import dataclass

from shapely import STRtree
from shapely.ops import nearest_points

from app.engine.geometry import work_footprint
from app.models import ClashKind, Point3, Work

NEAR_M = 5.0
DIG_ONCE_WINDOW_DAYS = 90


@dataclass(frozen=True)
class ScheduleFinding:
    kind: ClashKind
    work_a: Work  # lower work id
    work_b: Work
    overlap_days: int
    gap_days: int
    location: Point3


def detect_schedule(works: Sequence[Work]) -> list[ScheduleFinding]:
    """One finding per pair within 5 m, sorted by (id_a, id_b).

    ``overlap_days`` counts both end dates; ``gap_days`` = later start - earlier end.
    """
    ordered = sorted(works, key=lambda w: w.id)
    if len(ordered) < 2:
        return []
    footprints = [work_footprint(w) for w in ordered]
    tree = STRtree(footprints)

    findings: list[ScheduleFinding] = []
    for i, a in enumerate(ordered):
        near = tree.query(footprints[i], predicate="dwithin", distance=NEAR_M)
        for j in sorted(int(k) for k in near):
            if j <= i:
                continue
            b = ordered[j]
            if a.start_date <= b.end_date and b.start_date <= a.end_date:
                kind = ClashKind.SCHEDULE_OVERLAP
                overlap = (min(a.end_date, b.end_date) - max(a.start_date, b.start_date)).days + 1
                gap = 0
            else:
                first, second = (a, b) if a.end_date < b.start_date else (b, a)
                gap = (second.start_date - first.end_date).days
                if gap > DIG_ONCE_WINDOW_DAYS:
                    continue
                kind = ClashKind.DIG_ONCE
                overlap = 0
            p, q = nearest_points(footprints[i], footprints[j])
            findings.append(
                ScheduleFinding(
                    kind=kind,
                    work_a=a,
                    work_b=b,
                    overlap_days=overlap,
                    gap_days=gap,
                    location=((p.x + q.x) / 2, (p.y + q.y) / 2, 0.0),
                )
            )
    return findings
