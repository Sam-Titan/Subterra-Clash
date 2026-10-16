from pydantic import Field

from app.models.base import ApiModel
from app.models.enums import Certainty, Utility


class SummaryCounts(ApiModel):
    """Unresolved clashes only: review status OPEN or ESCALATED (see API_CONTRACT)."""

    open: int
    critical: int
    high: int
    needs_data: int
    dig_once: int
    schedule_overlap: int


class UtilityCount(ApiModel):
    utility: Utility
    count: int


class CertaintyCount(ApiModel):
    certainty: Certainty
    count: int


class EvalScore(ApiModel):
    true_positives: int
    false_alarms: int
    misses: int
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)


class EvalCase(ApiModel):
    """`expected` / `ours` are a ClashKind name or NO_CLASH; `baseline` is FLAGGED / NOT_FLAGGED.
    Certainty fields are null when the outcome is NO_CLASH (or not specified by the truth)."""

    case_id: str
    description: str
    expected: str
    expected_certainty: Certainty | None
    ours: str
    ours_certainty: Certainty | None
    baseline: str


class Evaluation(ApiModel):
    ours: EvalScore
    baseline: EvalScore
    cases: list[EvalCase]


class Summary(ApiModel):
    counts: SummaryCounts
    by_utility: list[UtilityCount]
    by_certainty: list[CertaintyCount]
    evaluation: Evaluation
