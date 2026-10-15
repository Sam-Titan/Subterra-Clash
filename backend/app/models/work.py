from datetime import date
from typing import Annotated

from pydantic import Field

from app.models.base import ApiModel
from app.models.enums import Utility, WorkOrigin, WorkType
from app.models.geography import Point2, Point3

WorkId = Annotated[str, Field(pattern=r"^WRK-\d{3,}$")]


class SourcePermit(ApiModel):
    permit_no: str
    source: str
    submitted_on: date


class Work(ApiModel):
    """Proposed work. Depths are positive numbers below the surface (SPEC §7.3)."""

    id: WorkId
    title: str
    agency: str
    work_type: WorkType
    utility: Utility | None = None
    path: list[Point2] = Field(min_length=2)
    width_m: float = Field(ge=0)
    depth_from_m: float
    depth_to_m: float
    bore_path: list[Point3] | None = None
    bore_diameter_m: float | None = Field(default=None, gt=0)
    start_date: date
    end_date: date
    source_permit: SourcePermit
    origin: WorkOrigin = WorkOrigin.SEED
    field_confidence: dict[str, float] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
