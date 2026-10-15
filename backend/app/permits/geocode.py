"""Deterministic geocoder: street + from/to refs + side + offset → 2D work path (SPEC §9.3).

The LLM never produces coordinates; everything here is gazetteer lookup and plane geometry.
`offset_m` is measured from the street centreline, on the stated side. Missing values are not
silently defaulted: each assumption is written to `notes`.
"""

import math
import re
from collections.abc import Mapping

from shapely import LineString, Point
from shapely.ops import substring

from app.data.gazetteer import JUNCTIONS, LANDMARKS, STREETS
from app.models import Point2, Street
from app.permits.models import ExtractedField, GeocodeResult
from app.permits.rules_extract import LANDMARK_ALIASES, STREET_ALIASES

KERB_INSET_M = 3.0  # default path position: this far inside the street edge
MIN_LENGTH_M = 1.0

_SIDE_VECTOR = {"NORTH": (0.0, 1.0), "SOUTH": (0.0, -1.0), "EAST": (1.0, 0.0), "WEST": (-1.0, 0.0)}


def _norm(s: str) -> str:
    return re.sub(r"[.\s]+", " ", s.lower()).strip()


_STREETS = {s.id: s for s in STREETS}
_STREET_BY_NAME = {_norm(s.name): s.id for s in STREETS}
_POINTS: dict[str, Point2] = {j.id: (j.x, j.y) for j in JUNCTIONS}
_POINTS.update({lm.id: (lm.x, lm.y) for lm in LANDMARKS})
_REF_BY_NAME = {_norm(j.name): j.id for j in JUNCTIONS}
_REF_BY_NAME.update({_norm(lm.name): lm.id for lm in LANDMARKS})
_REF_BY_NAME.update(LANDMARK_ALIASES)


def _prefixed_id(raw: str, prefix: str) -> str | None:
    m = re.fullmatch(prefix + r"[-\s]?0*(\d{1,2})", raw.strip(), re.IGNORECASE)
    return f"{prefix}-{int(m.group(1)):02d}" if m else None


def resolve_street(value: object) -> Street | None:
    """Street id (ST-01), name or alias ("stn rd") → Street, case-insensitive."""
    if not isinstance(value, str) or not value.strip():
        return None
    sid = _prefixed_id(value, "ST") or STREET_ALIASES.get(_norm(value))
    return _STREETS.get(sid or _STREET_BY_NAME.get(_norm(value), ""))


def resolve_ref(value: object) -> str | None:
    """Junction / landmark id ("JN-03", "J3", "LM-02") or name ("Bus Depot") → canonical id."""
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    short = re.fullmatch(r"(?:JN|J)[-\s]?0*(\d{1,2})", raw, re.IGNORECASE)
    if short:
        ref: str | None = f"JN-{int(short.group(1)):02d}"
    else:
        ref = _prefixed_id(raw, "LM") or _REF_BY_NAME.get(_norm(raw))
    return ref if ref in _POINTS else None


def _value(fields: Mapping[str, ExtractedField], name: str) -> str | float | None:
    f = fields.get(name)
    return f.value if f else None


def _failed(notes: list[str]) -> GeocodeResult:
    return GeocodeResult(status="FAILED", path=[], notes=notes)


def geocode(fields: Mapping[str, ExtractedField]) -> GeocodeResult:
    notes: list[str] = []
    street = resolve_street(_value(fields, "street"))
    start = resolve_ref(_value(fields, "from_ref"))
    end = resolve_ref(_value(fields, "to_ref"))
    if street is None:
        notes.append("street missing or not in the gazetteer → pick a street")
    if start is None:
        notes.append("from_ref missing or not in the gazetteer → pick a junction or landmark")
    if end is None:
        notes.append("to_ref missing or not in the gazetteer → pick a junction or landmark")
    if street is None or start is None or end is None:
        return _failed(notes)

    line = LineString(street.centerline)
    d0 = line.project(Point(_POINTS[start]))
    d1 = line.project(Point(_POINTS[end]))
    if abs(d1 - d0) < MIN_LENGTH_M:
        return _failed([f"{start} and {end} are the same place along {street.name}"])
    along = substring(line, d0, d1)
    coords = list(along.coords)
    notes.append(f"{start} → {end} projected onto {street.name} centreline")

    side = _value(fields, "side")
    side = side.upper() if isinstance(side, str) else None
    if side not in _SIDE_VECTOR:
        notes.append("side missing → path left on the street centreline")
        return GeocodeResult(status="PARTIAL", path=_round(coords), notes=notes)

    dx, dy = coords[-1][0] - coords[0][0], coords[-1][1] - coords[0][1]
    norm = math.hypot(dx, dy)
    left = (-dy / norm, dx / norm)
    dot = left[0] * _SIDE_VECTOR[side][0] + left[1] * _SIDE_VECTOR[side][1]
    if abs(dot) < 0.5:
        notes.append(f"{side} is not a side of {street.name} → path left on the centreline")
        return GeocodeResult(status="PARTIAL", path=_round(coords), notes=notes)

    offset = _value(fields, "offset_m")
    if isinstance(offset, int | float) and not isinstance(offset, bool):
        distance = float(offset)
        notes.append(f"offset {distance:g} m from the centreline, {side.lower()} side")
    else:
        distance = max(street.width_m / 2 - KERB_INSET_M, 0.0)
        notes.append(
            f"offset_m missing → using street side edge ({KERB_INSET_M:g} m from kerb), "
            f"{side.lower()} side"
        )
    shifted = [(x + left[0] * distance * math.copysign(1, dot), y + left[1] * distance
                * math.copysign(1, dot)) for x, y in coords]  # fmt: skip
    return GeocodeResult(status="RESOLVED", path=_round(shifted), notes=notes)


def _round(coords: list[tuple[float, ...]]) -> list[Point2]:
    return [(round(c[0], 3), round(c[1], 3)) for c in coords]
