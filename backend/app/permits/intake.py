"""Permit draft → proposed Work (origin INTAKE), field edits and INTAKE work uncertainty.

Nothing here approves or rejects a permit; a committed draft is only added to the coordination
plan. Missing values are never silently defaulted: every assumption lands in `missing_fields`.
"""

import math
from dataclasses import dataclass
from datetime import date

from shapely import LineString

from app.models import Point2, Point3, SourcePermit, Utility, Work, WorkOrigin, WorkType
from app.permits.geocode import resolve_ref, resolve_street
from app.permits.models import (
    FIELD_NAMES,
    SIDES,
    ExtractedField,
    GeocodeResult,
    LlmModeUsed,
    empty_field,
)

ASSUMED_DEPTH_MAX_M = 3.0  # worst depth of the plausible band (SPEC §8.3); unknown → this
ASSUMED_WIDTH_M = 0.6
EDITED_QUOTE = "edited by reviewer"

LOCATION_FIELDS = ("street", "from_ref", "to_ref", "side", "offset_m")
_NUMERIC = {"offset_m", "depth_from_m", "depth_to_m", "width_m", "diameter_m"}
_DATES = {"start_date", "end_date"}
_TEXT = {"agency", "permit_no"}
_ENUMS = {
    "work_type": {w.value for w in WorkType},
    "utility": {u.value for u in Utility},
    "side": set(SIDES),
}

# Uncertainty added to a work's own position (combined with the asset's by the engine).
LOCATION_UNCERTAINTY_SCALE_M = 2.0
OFFSET_MISSING_M = 1.0
WIDTH_ASSUMED_M = 0.3


class InvalidFieldValue(ValueError):
    """A PATCH value that cannot be stored (API: 422 INVALID_FIELD_VALUE)."""


class DraftIncomplete(ValueError):
    """Fields that must exist before a Work can be built (API: 422 DRAFT_INCOMPLETE)."""

    def __init__(self, missing: list[str]) -> None:
        super().__init__(f"Cannot add to the plan without: {', '.join(missing)}")
        self.missing = missing


@dataclass
class DraftRecord:
    draft_id: str
    source_text: str
    llm_mode_used: LlmModeUsed
    fields: dict[str, ExtractedField]
    committed_work_id: str | None = None

    def missing_fields(self) -> list[str]:
        return [n for n in FIELD_NAMES if self.fields[n].value is None]


def coerce_field(name: str, value: object) -> str | float | None:
    """Validate a reviewer edit; returns the value to store (ids normalised)."""
    if value is None:
        return None
    if isinstance(value, bool):
        raise InvalidFieldValue(f"{name}: expected a value, got a boolean")
    if name == "street":
        street = resolve_street(value)
        if street is None:
            raise InvalidFieldValue(f"{name}: unknown street {value!r}")
        return street.id
    if name in ("from_ref", "to_ref"):
        ref = resolve_ref(value)
        if ref is None:
            raise InvalidFieldValue(f"{name}: unknown junction or landmark {value!r}")
        return ref
    if name in _ENUMS:
        text = str(value).strip().upper()
        if text not in _ENUMS[name]:
            raise InvalidFieldValue(f"{name}: must be one of {sorted(_ENUMS[name])}")
        return text
    if name in _NUMERIC:
        try:
            number = float(value)  # type: ignore[arg-type]
        except TypeError, ValueError:
            raise InvalidFieldValue(f"{name}: expected a number") from None
        if not math.isfinite(number) or number < 0:
            raise InvalidFieldValue(f"{name}: must be a non-negative number")
        return round(number, 4)
    if name in _DATES:
        try:
            return date.fromisoformat(str(value)).isoformat()
        except ValueError:
            raise InvalidFieldValue(f"{name}: expected an ISO date YYYY-MM-DD") from None
    if name in _TEXT:
        text = str(value).strip()
        if not text:
            raise InvalidFieldValue(f"{name}: must not be empty")
        return text
    raise InvalidFieldValue(f"{name}: unknown field")


def apply_edits(fields: dict[str, ExtractedField], edits: dict[str, object]) -> None:
    """Apply validated edits in place: confidence 1.0, quote "edited by reviewer"; null clears."""
    coerced = {name: coerce_field(name, value) for name, value in edits.items()}
    for name, value in coerced.items():
        if value is None:
            fields[name] = empty_field()
        else:
            fields[name] = ExtractedField(value=value, confidence=1.0, source_quote=EDITED_QUOTE)


def _num(fields: dict[str, ExtractedField], name: str) -> float | None:
    v = fields[name].value
    return float(v) if isinstance(v, int | float) else None


def _text(fields: dict[str, ExtractedField], name: str) -> str | None:
    v = fields[name].value
    return str(v) if v is not None else None


def blockers(fields: dict[str, ExtractedField]) -> list[str]:
    """Fields without which no Work can be formed (everything else is listed, not blocked)."""
    need = ["work_type", "start_date", "end_date"]
    out = [n for n in need if fields[n].value is None]
    if _text(fields, "work_type") in ("PIPE_LAY", "HDD") and fields["diameter_m"].value is None:
        out.append("diameter_m")
    return out


def next_work_id(existing: list[str]) -> str:
    n = max((int(i.rsplit("-", 1)[1]) for i in existing), default=0) + 1
    return f"WRK-{n:03d}"


def build_work(
    fields: dict[str, ExtractedField], geo: GeocodeResult, work_id: str, submitted_on: date
) -> Work:
    """Build the INTAKE Work. Raises DraftIncomplete when a required field is missing."""
    blocked = blockers(fields)
    if blocked:
        raise DraftIncomplete(blocked)
    if not geo.path:
        raise DraftIncomplete(["street", "from_ref", "to_ref"])

    wtype = WorkType(_text(fields, "work_type"))
    utility = _text(fields, "utility")
    missing = [n for n in FIELD_NAMES if fields[n].value is None]
    confidence = {n: fields[n].confidence for n in FIELD_NAMES if fields[n].value is not None}
    dia = _num(fields, "diameter_m")
    depth_to = _num(fields, "depth_to_m")
    depth_from = _num(fields, "depth_from_m")

    # Unknown depth: worst case of the plausible band; the engine reads `missing_fields`.
    depth_to_stored = ASSUMED_DEPTH_MAX_M if depth_to is None else depth_to
    if depth_from is None:
        depth_from_stored = 0.0
        if wtype is WorkType.HDD and depth_to is not None and dia is not None:
            depth_from_stored = max(depth_to - dia, 0.0)
    else:
        depth_from_stored = depth_from

    width = _num(fields, "width_m")
    path: list[Point2] = list(geo.path)
    bore_path: list[Point3] | None = None
    bore_d: float | None = None
    if wtype in (WorkType.TRENCH, WorkType.PIT):
        if width is None:
            width = ASSUMED_WIDTH_M
        if wtype is WorkType.PIT:
            ring = LineString(path).buffer(width / 2, cap_style="flat")
            path = [(round(x, 3), round(y, 3)) for x, y in list(ring.exterior.coords)[:-1]]
    else:
        assert dia is not None
        bore_d = dia
        width = width if width is not None else dia
        if wtype is WorkType.HDD:
            z = -(depth_to_stored - dia / 2)
            bore_path = [(x, y, z) for x, y in path]

    permit_no = _text(fields, "permit_no")
    agency = _text(fields, "agency")
    street = resolve_street(_text(fields, "street"))
    label = utility.title() if utility else "Works"
    return Work(
        id=work_id,
        title=f"{label} {wtype.value.lower().replace('_', ' ')} — {street.name if street else ''}",
        agency=agency or "Unknown agency",
        work_type=wtype,
        utility=Utility(utility) if utility else None,
        path=path,
        width_m=width,
        depth_from_m=depth_from_stored,
        depth_to_m=depth_to_stored,
        bore_path=bore_path,
        bore_diameter_m=bore_d,
        start_date=date.fromisoformat(str(fields["start_date"].value)),
        end_date=date.fromisoformat(str(fields["end_date"].value)),
        source_permit=SourcePermit(
            permit_no=permit_no or "UNKNOWN", source="Permit intake", submitted_on=submitted_on
        ),
        origin=WorkOrigin.INTAKE,
        field_confidence=confidence,
        missing_fields=missing,
    )


def intake_uncertainty(work: Work) -> float:
    """Own positional uncertainty (m) of an INTAKE work, from low-confidence location fields.

    ``(1 − lowest location confidence) × 2 m``, plus 1 m when the offset was not stated and
    0.3 m when a trench width had to be assumed. Seed works have none.
    """
    if work.origin is not WorkOrigin.INTAKE:
        return 0.0
    present = [
        work.field_confidence[n]
        for n in LOCATION_FIELDS
        if n in work.field_confidence and n not in work.missing_fields
    ]
    lowest = min(present) if present else 0.0
    u = (1.0 - lowest) * LOCATION_UNCERTAINTY_SCALE_M
    if "offset_m" in work.missing_fields:
        u += OFFSET_MISSING_M
    if "width_m" in work.missing_fields and work.work_type in (WorkType.TRENCH, WorkType.PIT):
        u += WIDTH_ASSUMED_M
    return round(u, 2)
