"""Single entry point: scene + rules -> clashes, groups, baseline pairs (SPEC §8)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date

from app.config import get_settings
from app.engine.baseline import baseline_pairs
from app.engine.detect import SpatialFinding, detect_spatial
from app.engine.explain import (
    schedule_evidence,
    schedule_explanation,
    spatial_evidence,
    spatial_explanation,
)
from app.engine.grouping import group_clashes
from app.engine.schedule import ScheduleFinding, detect_schedule
from app.engine.severity import compute_severity
from app.models import (
    Certainty,
    Clash,
    ClashGroup,
    Location,
    Rule,
    Scene,
    Schedule,
)

# Internal stable key (not in the API model):
#   spatial:  (kind, work_id, asset_id)       schedule: (kind, min_work_id, max_work_id)
ClashKey = tuple[str, str, str]


@dataclass(frozen=True)
class AnalysisResult:
    clashes: list[Clash]
    groups: list[ClashGroup]
    baseline_pairs: set[tuple[str, str]]
    key_to_id: dict[ClashKey, str]  # full map incl. keys no longer produced; ids never reused
    id_to_key: dict[str, ClashKey] = field(default_factory=dict)


def _next_number(ids: Mapping[ClashKey, str]) -> int:
    return max((int(v.rsplit("-", 1)[1]) for v in ids.values()), default=0) + 1


def _r(v: float | None) -> float | None:
    """Round to 0.1 mm to hide float noise (0.180000000000004); results are unchanged."""
    return None if v is None else round(v, 4)


def _location(p: tuple[float, float, float]) -> Location:
    return Location(x=round(p[0], 3), y=round(p[1], 3), z=round(p[2], 3))


def _spatial_clash(f: SpatialFinding, today: date, base: set[tuple[str, str]]) -> Clash:
    return Clash(
        id="CLH-0000",
        kind=f.kind,
        certainty=f.certainty,
        severity=compute_severity(
            kind=f.kind,
            certainty=f.certainty,
            utility=f.asset.utility,
            gap_m=f.gap_m,
            required_m=f.required_m,
            start=f.work.start_date,
            today=today,
        ),
        work_ids=[f.work.id],
        asset_ids=[f.asset.id],
        location=_location(f.location),
        measured_gap_m=_r(f.gap_m),
        required_clearance_m=f.required_m,
        uncertainty_m=_r(f.uncertainty_m),
        rule_id=f.rule.id,
        explanation=spatial_explanation(f),
        evidence=spatial_evidence(f),
        missing_data=list(f.missing_data),
        group_id="GRP-00",
        baseline_flagged=(f.work.id, f.asset.id) in base,
    )


def _schedule_clash(f: ScheduleFinding, today: date) -> Clash:
    return Clash(
        id="CLH-0000",
        kind=f.kind,
        certainty=Certainty.LIKELY,
        severity=compute_severity(
            kind=f.kind,
            certainty=Certainty.LIKELY,
            utility=None,
            gap_m=None,
            required_m=None,
            start=min(f.work_a.start_date, f.work_b.start_date),
            today=today,
        ),
        work_ids=[f.work_a.id, f.work_b.id],
        location=_location(f.location),
        schedule=Schedule(overlap_days=f.overlap_days, gap_days=f.gap_days),
        explanation=schedule_explanation(f),
        evidence=schedule_evidence(f),
        group_id="GRP-00",
        baseline_flagged=False,
    )


def analyze(
    scene: Scene,
    rules: Sequence[Rule],
    today: date | None = None,
    previous_ids: Mapping[ClashKey, str] | None = None,
    work_uncertainty_m: Mapping[str, float] | None = None,
) -> AnalysisResult:
    """Run the full engine. Deterministic: same input and ``previous_ids`` -> same output.

    Clash ids are stable per key: a key already in ``previous_ids`` keeps its id; new keys get
    the next unused number in engine order (spatial by work/asset id, then schedule pairs).
    """
    today = today or get_settings().demo_date
    key_to_id: dict[ClashKey, str] = dict(previous_ids or {})
    base = baseline_pairs(scene.works, scene.assets)

    drafts: list[tuple[ClashKey, Clash]] = []
    for sf in detect_spatial(scene.works, scene.assets, rules, work_uncertainty_m):
        drafts.append(((sf.kind.value, sf.work.id, sf.asset.id), _spatial_clash(sf, today, base)))
    for ef in detect_schedule(scene.works):
        key = (ef.kind.value, ef.work_a.id, ef.work_b.id)
        drafts.append((key, _schedule_clash(ef, today)))

    n = _next_number(key_to_id)
    clashes: list[Clash] = []
    for key, clash in drafts:
        cid = key_to_id.get(key)
        if cid is None:
            cid = f"CLH-{n:04d}"
            key_to_id[key] = cid
            n += 1
        clashes.append(clash.model_copy(update={"id": cid}))

    clashes, groups = group_clashes(clashes, scene.works, scene.streets)
    return AnalysisResult(
        clashes=clashes,
        groups=groups,
        baseline_pairs=base,
        key_to_id=key_to_id,
        id_to_key={v: k for k, v in key_to_id.items()},
    )


__all__ = ["AnalysisResult", "ClashKey", "analyze"]
