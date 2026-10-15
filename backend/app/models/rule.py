from pydantic import Field

from app.models.base import ApiModel
from app.models.enums import Utility, WorkType


class RuleAppliesTo(ApiModel):
    """An empty list means "any"."""

    work_types: list[WorkType] = Field(default_factory=list)
    utility: list[Utility] = Field(default_factory=list)
    work_utility: list[Utility] = Field(default_factory=list)


class Rule(ApiModel):
    id: str = Field(pattern=r"^R-[A-Z-]+$")
    applies_to: RuleAppliesTo
    min_clearance_m: float = Field(gt=0)
    label: str
