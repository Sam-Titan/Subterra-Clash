"""Pure geometry for the clash engine (SPEC §8.1, §8.2).

Units are metres; z is negative below ground. Depths are positive numbers below the
surface. Nothing here knows about rules, certainty or schedule: that lives in detect.py.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import nearest_points

from app.models import Asset, Point2, Point3, Work, WorkType

# Asset footprints are buffered by radius + horizontal precision + this margin (SPEC §8.1).
ASSET_FOOTPRINT_MARGIN_M = 1.5
# Candidate searches buffer the work footprint by this much so near-misses are found.
SEARCH_MARGIN_M = 1.5

_EPS = 1e-12


@dataclass(frozen=True)
class PolyDistance:
    dist: float
    point_a: Point3
    point_b: Point3


@dataclass(frozen=True)
class GapResult:
    """Surface-to-surface gap (negative = overlap depth) and the closest-approach point."""

    gap: float
    location: Point3


def _pt(v: np.ndarray) -> Point3:
    return (float(v[0]), float(v[1]), float(v[2]))


def segment_distance(
    p0: Sequence[float], p1: Sequence[float], q0: Sequence[float], q1: Sequence[float]
) -> tuple[float, Point3, Point3]:
    """Minimum distance between 3D segments p0–p1 and q0–q1, plus the two closest points."""
    a0, a1, b0, b1 = (np.asarray(v, dtype=float) for v in (p0, p1, q0, q1))
    d1 = a1 - a0
    d2 = b1 - b0
    r = a0 - b0
    a = float(d1 @ d1)
    e = float(d2 @ d2)
    f = float(d2 @ r)

    if a <= _EPS and e <= _EPS:
        s = t = 0.0
    elif a <= _EPS:
        s = 0.0
        t = min(max(f / e, 0.0), 1.0)
    else:
        c = float(d1 @ r)
        if e <= _EPS:
            t = 0.0
            s = min(max(-c / a, 0.0), 1.0)
        else:
            b = float(d1 @ d2)
            denom = a * e - b * b
            s = min(max((b * f - c * e) / denom, 0.0), 1.0) if denom > _EPS else 0.0
            t = (b * s + f) / e
            if t < 0.0:
                t = 0.0
                s = min(max(-c / a, 0.0), 1.0)
            elif t > 1.0:
                t = 1.0
                s = min(max((b - c) / a, 0.0), 1.0)

    ca = a0 + d1 * s
    cb = b0 + d2 * t
    return float(np.linalg.norm(ca - cb)), _pt(ca), _pt(cb)


def polyline_distance(a: Sequence[Point3], b: Sequence[Point3]) -> PolyDistance:
    """Minimum 3D distance between two polylines (first minimum wins on ties)."""
    best: PolyDistance | None = None
    for i in range(len(a) - 1):
        for j in range(len(b) - 1):
            d, pa, pb = segment_distance(a[i], a[i + 1], b[j], b[j + 1])
            if best is None or d < best.dist:
                best = PolyDistance(d, pa, pb)
    if best is None:
        raise ValueError("polylines need at least two vertices each")
    return best


def pipe_gap(
    path_a: Sequence[Point3], radius_a: float, path_b: Sequence[Point3], radius_b: float
) -> GapResult:
    """Surface-to-surface gap between two pipes; location is the midpoint of closest points."""
    r = polyline_distance(path_a, path_b)
    mid = (
        (r.point_a[0] + r.point_b[0]) / 2,
        (r.point_a[1] + r.point_b[1]) / 2,
        (r.point_a[2] + r.point_b[2]) / 2,
    )
    return GapResult(gap=r.dist - radius_a - radius_b, location=mid)


def depth_at(path: Sequence[Point3], xy: Point2) -> float:
    """Interpolated |z| at the point of the polyline closest (in plan) to ``xy``."""
    px, py = xy
    best_d = math.inf
    best_z = 0.0
    for (x0, y0, z0), (x1, y1, z1) in zip(path, path[1:], strict=False):
        dx, dy = x1 - x0, y1 - y0
        len2 = dx * dx + dy * dy
        t = 0.0 if len2 <= _EPS else min(max(((px - x0) * dx + (py - y0) * dy) / len2, 0.0), 1.0)
        d = math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
        if d < best_d:
            best_d = d
            best_z = z0 + t * (z1 - z0)
    return abs(best_z)


# ------------------------------------------------------------------ footprints


def asset_footprint(asset: Asset) -> BaseGeometry:
    line = LineString([(x, y) for x, y, _ in asset.path])
    return line.buffer(asset.diameter_m / 2 + asset.horiz_precision_m + ASSET_FOOTPRINT_MARGIN_M)


def work_footprint(work: Work) -> BaseGeometry:
    """2D footprint per work type (SPEC §8.1). Trench ends are flat, bore buffers round."""
    match work.work_type:
        case WorkType.TRENCH:
            return LineString(work.path).buffer(work.width_m / 2, cap_style="flat")
        case WorkType.PIT:
            return Polygon(work.path)
        case WorkType.HDD:
            if not work.bore_path or work.bore_diameter_m is None:
                raise ValueError(f"{work.id}: HDD needs bore_path and bore_diameter_m")
            xy = [(x, y) for x, y, _ in work.bore_path]
            return LineString(xy).buffer(work.bore_diameter_m / 2)
        case WorkType.PIPE_LAY:
            if work.bore_diameter_m is None:
                raise ValueError(f"{work.id}: PIPE_LAY needs bore_diameter_m")
            return LineString(work.path).buffer(work.bore_diameter_m / 2)
    raise ValueError(f"unsupported work type {work.work_type}")


def work_work_distance_2d(a: Work, b: Work) -> float:
    return float(work_footprint(a).distance(work_footprint(b)))


# ------------------------------------------------------------------ gaps


def pipe_work_centreline(work: Work) -> list[Point3]:
    """3D centreline of a pipe-like work: HDD bore, or PIPE_LAY path at its centre depth."""
    if work.work_type is WorkType.HDD:
        if not work.bore_path:
            raise ValueError(f"{work.id}: HDD needs bore_path")
        return list(work.bore_path)
    if work.work_type is WorkType.PIPE_LAY:
        if work.bore_diameter_m is None:
            raise ValueError(f"{work.id}: PIPE_LAY needs bore_diameter_m")
        z = -(work.depth_to_m - work.bore_diameter_m / 2)
        return [(x, y, z) for x, y in work.path]
    raise ValueError(f"{work.id}: {work.work_type} is not a pipe-like work")


def _closest_point_in_plan(line: LineString, fp: BaseGeometry) -> tuple[float, float]:
    p = nearest_points(fp, line)[1]
    return (p.x, p.y)


def _shallowest_point_inside(
    path: Sequence[Point3], line: LineString, fp: BaseGeometry
) -> tuple[float, float]:
    """Plan point of the asset inside the footprint where it is shallowest (worst case)."""
    coords = shapely.get_coordinates(line.intersection(fp))
    if len(coords) == 0:
        return _closest_point_in_plan(line, fp)
    best_xy = (float(coords[0][0]), float(coords[0][1]))
    best_depth = depth_at(path, best_xy)
    for cx, cy in coords[1:]:
        d = depth_at(path, (float(cx), float(cy)))
        if d < best_depth:
            best_depth, best_xy = d, (float(cx), float(cy))
    return best_xy


def excavation_gap(work: Work, asset: Asset) -> GapResult:
    """TRENCH / PIT versus a pipe (SPEC §8.2, 2.5D)."""
    fp = work_footprint(work)
    line = LineString([(x, y) for x, y, _ in asset.path])
    radius = asset.diameter_m / 2
    dist = float(fp.distance(line))
    h = dist - radius

    if line.intersects(fp):
        xy = _shallowest_point_inside(asset.path, line, fp)
    else:
        xy = _closest_point_in_plan(line, fp)
    depth = depth_at(asset.path, xy)
    top, bottom = depth - radius, depth + radius
    location: Point3 = (xy[0], xy[1], -depth)

    if h <= 0:
        # Asset passes under / through the footprint. Normally it sits below the floor;
        # an asset wholly shallower than the excavation band is separated vertically.
        if bottom < work.depth_from_m:
            return GapResult(gap=work.depth_from_m - bottom, location=location)
        return GapResult(gap=top - work.depth_to_m, location=location)

    v = max(0.0, top - work.depth_to_m, work.depth_from_m - bottom)
    return GapResult(gap=math.hypot(h, v), location=location)


def work_asset_gap(work: Work, asset: Asset) -> GapResult:
    """Gap between any work and an existing asset, dispatched on work type."""
    if work.work_type in (WorkType.TRENCH, WorkType.PIT):
        return excavation_gap(work, asset)
    if work.bore_diameter_m is None:
        raise ValueError(f"{work.id}: {work.work_type} needs bore_diameter_m")
    return pipe_gap(
        pipe_work_centreline(work),
        work.bore_diameter_m / 2,
        asset.path,
        asset.diameter_m / 2,
    )
