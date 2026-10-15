from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import RecordMethod, Utility
from app.models.geography import Point3

AssetId = Annotated[str, Field(pattern=r"^AST-\d{4,}$")]


class SourceRecord(BaseModel):
    record_id: str
    source: str
    captured_on: date
    method: RecordMethod


class Asset(BaseModel):
    """Existing underground utility. z is negative below ground (SPEC §6)."""

    id: AssetId
    utility: Utility
    owner: str
    label: str
    path: list[Point3] = Field(min_length=2)
    diameter_m: float = Field(gt=0)
    horiz_precision_m: float = Field(ge=0)
    depth_precision_m: float | None = Field(default=None, ge=0)
    depth_known: bool
    source_record: SourceRecord
