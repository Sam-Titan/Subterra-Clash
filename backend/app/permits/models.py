"""Extraction result shapes (SPEC §9, API_CONTRACT permit intake)."""

from typing import Literal

from pydantic import Field

from app.models import AuditEntry, Point2, Work
from app.models.base import ApiModel

FIELD_NAMES: tuple[str, ...] = (
    "agency",
    "permit_no",
    "work_type",
    "utility",
    "street",
    "from_ref",
    "to_ref",
    "side",
    "offset_m",
    "depth_from_m",
    "depth_to_m",
    "width_m",
    "diameter_m",
    "start_date",
    "end_date",
)

SIDES: tuple[str, ...] = ("NORTH", "SOUTH", "EAST", "WEST")

LlmModeUsed = Literal["live", "cached", "rules"]


class ExtractionUnavailable(Exception):
    """Nothing to extract from (empty text)."""


class ExtractedField(ApiModel):
    value: str | float | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_quote: str | None = None


class ExtractionResult(ApiModel):
    fields: dict[str, ExtractedField]
    missing_fields: list[str]
    llm_mode_used: LlmModeUsed


def empty_field() -> ExtractedField:
    return ExtractedField(value=None, confidence=0.0, source_quote=None)


def build_result(fields: dict[str, ExtractedField], mode: LlmModeUsed) -> ExtractionResult:
    """Fill absent fields with empty ones and derive `missing_fields` (never defaulted)."""
    full = {name: fields.get(name) or empty_field() for name in FIELD_NAMES}
    missing = [name for name in FIELD_NAMES if full[name].value is None]
    return ExtractionResult(fields=full, missing_fields=missing, llm_mode_used=mode)


class GeocodeResult(ApiModel):
    status: Literal["RESOLVED", "PARTIAL", "FAILED"]
    path: list[Point2]
    notes: list[str]


class PermitDraft(ApiModel):
    """Response of parse / PATCH: a draft, nothing is in the plan until commit."""

    draft_id: str
    source_text: str
    llm_mode_used: LlmModeUsed
    fields: dict[str, ExtractedField]
    missing_fields: list[str]
    geocode: GeocodeResult
    preview_clash_count: int


class ParseTextRequest(ApiModel):
    text: str


class PatchDraftRequest(ApiModel):
    fields: dict[str, str | float | None]


class CommitRequest(ApiModel):
    reviewer: str = Field(min_length=1)


class CommitResponse(ApiModel):
    work: Work
    new_clash_ids: list[str]
    audit: AuditEntry
