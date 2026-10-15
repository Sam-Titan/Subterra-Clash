from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.asset import AssetId
from app.models.enums import Band, Certainty, ClashKind, ReviewStatus
from app.models.work import WorkId

ClashId = Annotated[str, Field(pattern=r"^CLH-\d{4,}$")]
GroupId = Annotated[str, Field(pattern=r"^GRP-\d{2,}$")]
AuditId = Annotated[str, Field(pattern=r"^AUD-\d{4,}$")]


class SeverityFactors(BaseModel):
    """The four terms of SPEC §8.5, each 0-1, before weighting."""

    hazard: float = Field(ge=0, le=1)
    breach: float = Field(ge=0, le=1)
    urgency: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)


class Severity(BaseModel):
    score: int = Field(ge=0, le=100)
    band: Band
    factors: SeverityFactors


class Location(BaseModel):
    x: float
    y: float
    z: float


class Schedule(BaseModel):
    overlap_days: int = 0
    gap_days: int = 0


class Evidence(BaseModel):
    """`type` is a free string; used values: ASSET_RECORD, PERMIT, RULE, PRECISION."""

    type: str
    ref: str
    detail: str


class Review(BaseModel):
    status: ReviewStatus = ReviewStatus.OPEN
    reviewer: str | None = None
    note: str | None = None
    updated_at: datetime | None = None


class Clash(BaseModel):
    id: ClashId
    kind: ClashKind
    certainty: Certainty
    severity: Severity
    work_ids: list[WorkId]
    asset_ids: list[AssetId] = Field(default_factory=list)
    location: Location
    measured_gap_m: float | None = None
    required_clearance_m: float | None = None
    uncertainty_m: float | None = None
    rule_id: str | None = None
    schedule: Schedule | None = None
    explanation: str
    evidence: list[Evidence] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    group_id: GroupId
    review: Review = Field(default_factory=Review)
    baseline_flagged: bool


class ClashGroup(BaseModel):
    id: GroupId
    clash_ids: list[ClashId]
    work_ids: list[WorkId]
    max_severity_score: int = Field(ge=0, le=100)
    review_rank: int = Field(ge=1)
    title: str


class AuditEntry(BaseModel):
    id: AuditId
    at: datetime
    actor: str
    action: str
    target_id: str | None = None
    detail: str
