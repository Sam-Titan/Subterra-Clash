"""Deterministic explanation and evidence templates (never LLM, AGENTS.md)."""

from app.engine.detect import PLAUSIBLE_DEPTH_MAX_M, PLAUSIBLE_DEPTH_MIN_M, SpatialFinding
from app.engine.schedule import NEAR_M, ScheduleFinding
from app.models import Certainty, ClashKind, Evidence, Work

RULE_NOTE = "illustrative clearance, not a regulatory standard"


def _permit(work: Work) -> Evidence:
    p = work.source_permit
    return Evidence(
        type="PERMIT",
        ref=p.permit_no,
        detail=(
            f"{work.id} {work.title} ({work.agency}); {work.start_date} to {work.end_date}; "
            f"source: {p.source}"
        ),
    )


def spatial_explanation(f: SpatialFinding) -> str:
    w, a, req = f.work.title, f"{f.asset.label} ({f.asset.id})", f.required_m
    if f.certainty is Certainty.NEEDS_DATA:
        band = f"{PLAUSIBLE_DEPTH_MIN_M:.1f}-{PLAUSIBLE_DEPTH_MAX_M:.1f} m"
        work_missing = f"{f.work.id}.depth" in f.missing_data
        asset_missing = f"{f.asset.id}.depth" in f.missing_data
        if work_missing and asset_missing:
            return (
                f"Neither {w} ({f.work.id}) nor {a} states a depth; at plausible depths of "
                f"{band} they could breach the {req:.2f} m clearance ({f.rule.id}), so both "
                "depths must be confirmed."
            )
        if work_missing:
            return (
                f"{w} ({f.work.id}) states no excavation depth; at a plausible depth of {band} "
                f"it could breach the {req:.2f} m clearance to {a} ({f.rule.id}), so the depth "
                "must be confirmed with the applicant."
            )
        return (
            f"{a} has no recorded depth; at a plausible depth of "
            f"{band}, {w} could breach the "
            f"{req:.2f} m clearance ({f.rule.id}), so the depth must be surveyed."
        )
    assert f.gap_m is not None and f.uncertainty_m is not None
    gap, u = f.gap_m, f.uncertainty_m
    if f.kind is ClashKind.INTERSECTION:
        head = f"{w} cuts through {a} with {-gap:.2f} m of overlap"
    else:
        head = f"{w} leaves {gap:.2f} m to {a}"
    if f.certainty is Certainty.LIKELY:
        tail = f"against {req:.2f} m required ({f.rule.id}), a breach even allowing ±{u:.2f} m."
    else:
        tail = (
            f"against {req:.2f} m required ({f.rule.id}); with ±{u:.2f} m of record "
            "uncertainty it may or may not meet the clearance."
        )
    return f"{head}, {tail}"


def spatial_evidence(f: SpatialFinding) -> list[Evidence]:
    a, s = f.asset, f.asset.source_record
    depth = (
        f"depth ±{a.depth_precision_m:.2f} m"
        if a.depth_precision_m is not None and a.depth_known
        else "depth not recorded"
    )
    out = [
        Evidence(
            type="ASSET_RECORD",
            ref=s.record_id,
            detail=f"{a.id} {a.label}; {s.source}; {s.method.value} on {s.captured_on}",
        ),
        _permit(f.work),
        Evidence(
            type="RULE",
            ref=f.rule.id,
            detail=f"{f.rule.label}: min {f.required_m:.2f} m ({RULE_NOTE})",
        ),
        Evidence(
            type="PRECISION",
            ref=a.id,
            detail=f"horizontal ±{a.horiz_precision_m:.2f} m; {depth}",
        ),
    ]
    if f"{f.work.id}.depth" in f.missing_data:
        out.append(
            Evidence(
                type="PRECISION",
                ref=f.work.id,
                detail=(
                    "excavation depth not stated in the permit; "
                    f"{PLAUSIBLE_DEPTH_MIN_M:.1f}-{PLAUSIBLE_DEPTH_MAX_M:.1f} m assessed"
                ),
            )
        )
    return out


def schedule_explanation(f: ScheduleFinding) -> str:
    a, b = f.work_a, f.work_b
    if f.kind is ClashKind.SCHEDULE_OVERLAP:
        return (
            f"{a.title} ({a.id}) and {b.title} ({b.id}) are within {NEAR_M:.0f} m and overlap "
            f"for {f.overlap_days} days; sequence or coordinate the works."
        )
    return (
        f"{a.title} ({a.id}) and {b.title} ({b.id}) are within {NEAR_M:.0f} m and "
        f"{f.gap_days} days apart; coordinating could let one excavation serve both (dig once)."
    )


def schedule_evidence(f: ScheduleFinding) -> list[Evidence]:
    return [_permit(f.work_a), _permit(f.work_b)]
