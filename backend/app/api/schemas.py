"""Response envelopes shared by the route modules (docs/API_CONTRACT.md)."""

from app.models import Asset, Clash, Rule, Work
from app.models.base import ApiModel

CLEARANCE_DISCLAIMER = "Illustrative values for this exercise; not a regulatory standard."


class ListResponse[T](ApiModel):
    items: list[T]
    total: int


class RulesResponse(ListResponse[Rule]):
    disclaimer: str = CLEARANCE_DISCLAIMER


class ClashDetail(ApiModel):
    clash: Clash
    assets: list[Asset]
    works: list[Work]
    rule: Rule | None  # null for SCHEDULE_OVERLAP clashes (no clearance rule applies)


class ResetResponse(ApiModel):
    status: str = "reset"


class ErrorResponse(ApiModel):
    detail: str
    code: str


class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str) -> None:
        self.status_code = status_code
        self.code = code
        self.detail = detail
