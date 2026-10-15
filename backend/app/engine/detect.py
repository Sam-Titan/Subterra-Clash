"""Spatial clash detection: candidates -> gap -> rule -> certainty -> kind (SPEC §8.1-8.3)."""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from shapely import STRtree

from app.engine.geometry import (
    SEARCH_MARGIN_M,
    asset_footprint,
    work_asset_gap,
    work_footprint,
)
from app.engine.rules import find_rule
from app.models import Asset, Certainty, ClashKind, Point3, Rule, Work, WorkType

# Plausible depth band used when an asset's depth is not recorded (SPEC §8.3).
PLAUSIBLE_DEPTH_MIN_M = 0.5
PLAUSIBLE_DEPTH_MAX_M = 3.0
_DEPTH_STEP_M = 0.1


@dataclass(frozen=True)
class SpatialFinding:
    work: Work
    asset: Asset
    rule: Rule
    kind: ClashKind
    certainty: Certainty
    gap_m: float | None  # None for NEEDS_DATA: never invent a gap
    required_m: float
    uncertainty_m: float | None
    location: Point3
    missing_data: tuple[str, ...] = ()


def classify(gap: float, required: float, u: float) -> Certainty | None:
    """SPEC §8.3 table for a known-depth asset; ``None`` means no clash."""
    if gap < required - u:
        return Certainty.LIKELY
    if gap < required + u:
        return Certainty.POSSIBLE
    return None


def depth_is_known(asset: Asset) -> bool:
    """A "known" depth must also carry a precision, otherwise it is treated as unknown."""
    return asset.depth_known and asset.depth_precision_m is not None


def asset_uncertainty(asset: Asset) -> float:
    return math.hypot(asset.horiz_precision_m, asset.depth_precision_m or 0.0)


def plausible_depths() -> list[float]:
    n = round((PLAUSIBLE_DEPTH_MAX_M - PLAUSIBLE_DEPTH_MIN_M) / _DEPTH_STEP_M)
    return [round(PLAUSIBLE_DEPTH_MIN_M + i * _DEPTH_STEP_M, 1) for i in range(n + 1)]


def _at_depth(asset: Asset, depth: float) -> Asset:
    return asset.model_copy(update={"path": [(x, y, -depth) for x, y, _ in asset.path]})


def work_depth_unknown(work: Work) -> bool:
    """INTAKE works whose permit stated no excavation depth (the stored depth is a placeholder)."""
    return "depth_to_m" in work.missing_fields


def _work_at_depth(work: Work, depth: float) -> Work:
    update: dict[str, object] = {"depth_to_m": depth}
    if work.work_type is WorkType.HDD and work.bore_path and work.bore_diameter_m:
        z = -(depth - work.bore_diameter_m / 2)
        update["bore_path"] = [(x, y, z) for x, y, _ in work.bore_path]
    return work.model_copy(update=update)


def _evaluate_pair(work: Work, asset: Asset, rule: Rule, work_u: float) -> SpatialFinding | None:
    required = rule.min_clearance_m
    work_unknown = work_depth_unknown(work)
    asset_unknown = not depth_is_known(asset)

    if work_unknown or asset_unknown:
        # Worst case over the plausible depth band; lateral precision still applies.
        depths = plausible_depths()
        works = [_work_at_depth(work, d) for d in depths] if work_unknown else [work]
        assets = [_at_depth(asset, d) for d in depths] if asset_unknown else [asset]
        worst = min(
            (work_asset_gap(w, a) for w in works for a in assets),
            key=lambda r: r.gap,
        )
        if worst.gap >= required + math.hypot(asset.horiz_precision_m, work_u):
            return None
        missing = ([f"{asset.id}.depth"] if asset_unknown else []) + (
            [f"{work.id}.depth"] if work_unknown else []
        )
        return SpatialFinding(
            work=work,
            asset=asset,
            rule=rule,
            kind=ClashKind.CLEARANCE,
            certainty=Certainty.NEEDS_DATA,
            gap_m=None,
            required_m=required,
            uncertainty_m=None,
            location=worst.location,
            missing_data=tuple(missing),
        )

    res = work_asset_gap(work, asset)
    u = math.hypot(asset_uncertainty(asset), work_u)
    certainty = classify(res.gap, required, u)
    if certainty is None:
        return None
    return SpatialFinding(
        work=work,
        asset=asset,
        rule=rule,
        kind=ClashKind.INTERSECTION if res.gap <= 0 else ClashKind.CLEARANCE,
        certainty=certainty,
        gap_m=res.gap,
        required_m=required,
        uncertainty_m=u,
        location=res.location,
    )


def detect_spatial(
    works: Sequence[Work],
    assets: Sequence[Asset],
    rules: Sequence[Rule],
    work_uncertainty_m: Mapping[str, float] | None = None,
) -> list[SpatialFinding]:
    """Every work x nearby asset that violates its rule, sorted by (work id, asset id).

    ``work_uncertainty_m`` is each work's own positional uncertainty (INTAKE works with
    low-confidence location fields); it defaults to 0 and is combined in quadrature.
    """
    if not works or not assets:
        return []
    ordered_assets = sorted(assets, key=lambda a: a.id)
    tree = STRtree([asset_footprint(a) for a in ordered_assets])
    extra = work_uncertainty_m or {}

    findings: list[SpatialFinding] = []
    for work in sorted(works, key=lambda w: w.id):
        probe = work_footprint(work).buffer(SEARCH_MARGIN_M)
        for idx in sorted(int(i) for i in tree.query(probe, predicate="intersects")):
            asset = ordered_assets[idx]
            finding = _evaluate_pair(
                work, asset, find_rule(rules, work, asset), extra.get(work.id, 0.0)
            )
            if finding is not None:
                findings.append(finding)
    return findings
