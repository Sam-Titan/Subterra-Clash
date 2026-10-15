from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.api.schemas import (
    AppError,
    ClashDetail,
    ErrorResponse,
    ListResponse,
    ReviewRequest,
    ReviewResponse,
)
from app.models import Band, Certainty, Clash, ClashGroup, ClashKind, ReviewStatus, Utility
from app.models.enums import ReviewAction
from app.store import Store, get_store

router = APIRouter(prefix="/api", tags=["clashes"])
StoreDep = Annotated[Store, Depends(get_store)]


def _num(clash_id: str) -> int:
    return int(clash_id.rsplit("-", 1)[1])


@router.get("/clashes", response_model=ListResponse[Clash])
def list_clashes(
    store: StoreDep,
    kind: ClashKind | None = None,
    certainty: Certainty | None = None,
    band: Band | None = None,
    status: ReviewStatus | None = None,
    utility: Utility | None = None,
    work_id: str | None = None,
    group_id: str | None = None,
    sort: Annotated[Literal["review_rank", "severity", "id"], Query()] = "review_rank",
) -> ListResponse[Clash]:
    asset_utility = {a.id: a.utility for a in store.scene.assets}
    group_rank = {g.id: g.review_rank for g in store.groups()}

    items = [
        c
        for c in store.clashes()
        if (kind is None or c.kind == kind)
        and (certainty is None or c.certainty == certainty)
        and (band is None or c.severity.band == band)
        and (status is None or c.review.status == status)
        and (utility is None or any(asset_utility.get(a) == utility for a in c.asset_ids))
        and (work_id is None or work_id in c.work_ids)
        and (group_id is None or c.group_id == group_id)
    ]
    if sort == "id":
        items.sort(key=lambda c: _num(c.id))
    elif sort == "severity":
        items.sort(key=lambda c: (-c.severity.score, _num(c.id)))
    else:
        items.sort(key=lambda c: (group_rank[c.group_id], -c.severity.score, _num(c.id)))
    return ListResponse[Clash](items=items, total=len(items))


@router.get(
    "/clashes/{clash_id}",
    response_model=ClashDetail,
    responses={404: {"model": ErrorResponse}},
)
def get_clash(clash_id: str, store: StoreDep) -> ClashDetail:
    clash = store.clash(clash_id)
    if clash is None:
        raise AppError(404, "CLASH_NOT_FOUND", f"No clash with id {clash_id}")
    return ClashDetail(
        clash=clash,
        assets=store.assets_by_id(clash.asset_ids),
        works=store.works_by_id(clash.work_ids),
        rule=store.rule(clash.rule_id),
    )


@router.post(
    "/clashes/{clash_id}/review",
    response_model=ReviewResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def review_clash(clash_id: str, body: ReviewRequest, store: StoreDep) -> ReviewResponse:
    if store.clash(clash_id) is None:
        raise AppError(404, "CLASH_NOT_FOUND", f"No clash with id {clash_id}")
    reviewer = body.reviewer.strip()
    if not reviewer:
        raise AppError(422, "REVIEWER_REQUIRED", "A reviewer name is required")
    note = (body.note or "").strip() or None
    if body.action == ReviewAction.DISMISS and note is None:
        raise AppError(422, "NOTE_REQUIRED", "Dismissing a clash requires a note")
    done = store.review_clash(clash_id, body.action, reviewer, note)
    if done is None:  # pragma: no cover - checked above
        raise AppError(404, "CLASH_NOT_FOUND", f"No clash with id {clash_id}")
    clash, audit = done
    return ReviewResponse(clash=clash, audit=audit)


@router.get("/groups", response_model=ListResponse[ClashGroup])
def list_groups(store: StoreDep) -> ListResponse[ClashGroup]:
    groups = store.groups()
    return ListResponse[ClashGroup](items=groups, total=len(groups))
