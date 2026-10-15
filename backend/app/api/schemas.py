"""Response envelopes shared by the route modules (docs/API_CONTRACT.md)."""

from pydantic import BaseModel

from app.models import Asset, Clash, Rule, Work

CLEARANCE_DISCLAIMER = "Illustrative values for this exercise; not a regulatory standard."


class ListResponse[T](BaseModel):
    items: list[T]
    total: int


class RulesResponse(ListResponse[Rule]):
    disclaimer: str = CLEARANCE_DISCLAIMER


class ClashDetail(BaseModel):
    clash: Clash
    assets: list[Asset]
    works: list[Work]
    rule: Rule | None  # null for SCHEDULE_OVERLAP clashes (no clearance rule applies)


class ResetResponse(BaseModel):
    status: str = "reset"


class ErrorResponse(BaseModel):
    detail: str
    code: str


class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str) -> None:
        self.status_code = status_code
        self.code = code
        self.detail = detail
