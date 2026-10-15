from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.api.schemas import AppError, ErrorResponse, ListResponse
from app.config import get_settings
from app.permits.extract import extract_permit
from app.permits.geocode import geocode
from app.permits.intake import (
    DraftIncomplete,
    DraftRecord,
    InvalidFieldValue,
    apply_edits,
    build_work,
)
from app.permits.models import (
    FIELD_NAMES,
    CommitRequest,
    CommitResponse,
    ExtractionUnavailable,
    PatchDraftRequest,
    PermitDraft,
)
from app.permits.pdf_text import PdfNoTextError, PdfTooLargeError, extract_pdf_text
from app.permits.sample_permits import SAMPLE_PERMITS, SamplePermit
from app.store import Store, get_store

router = APIRouter(prefix="/api", tags=["permits"])
StoreDep = Annotated[Store, Depends(get_store)]

_PARSE_BODY: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                }
            },
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "properties": {"file": {"type": "string", "format": "binary"}},
                    "required": ["file"],
                }
            },
        },
    }
}


def _view(store: Store, record: DraftRecord) -> PermitDraft:
    """Re-geocode and re-preview a draft (preview never touches the plan)."""
    geo = geocode(record.fields)
    preview = 0
    if geo.path and record.committed_work_id is None:
        try:
            work = build_work(record.fields, geo, store.next_work_id(), get_settings().demo_date)
            preview = store.preview_clash_count(work)
        except DraftIncomplete:
            preview = 0
    return PermitDraft(
        draft_id=record.draft_id,
        source_text=record.source_text,
        llm_mode_used=record.llm_mode_used,
        fields=record.fields,
        missing_fields=record.missing_fields(),
        geocode=geo,
        preview_clash_count=preview,
    )


def _get_draft(store: Store, draft_id: str) -> DraftRecord:
    record = store.draft(draft_id)
    if record is None:
        raise AppError(404, "DRAFT_NOT_FOUND", f"No permit draft with id {draft_id}")
    return record


@router.get("/permits/samples", response_model=ListResponse[SamplePermit])
def list_samples() -> ListResponse[SamplePermit]:
    return ListResponse[SamplePermit](items=SAMPLE_PERMITS, total=len(SAMPLE_PERMITS))


@router.post(
    "/permits/parse",
    response_model=PermitDraft,
    responses={
        400: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
    openapi_extra=_PARSE_BODY,
)
async def parse_permit(request: Request, store: StoreDep) -> PermitDraft:
    """Multipart `file` (PDF ≤ 5 MB) or JSON `{text}` → a draft; nothing enters the plan."""
    text = ""
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is not None and not isinstance(upload, str):
            try:
                text = extract_pdf_text(await upload.read())
            except PdfTooLargeError as exc:
                raise AppError(413, "FILE_TOO_LARGE", "PDF is larger than 5 MB") from exc
            except PdfNoTextError as exc:
                raise AppError(422, "PDF_NO_TEXT", str(exc)) from exc
        else:
            raw = form.get("text")
            text = raw if isinstance(raw, str) else ""
    else:
        try:
            body = await request.json()
        except ValueError:
            body = None
        raw = body.get("text") if isinstance(body, dict) else None
        text = raw if isinstance(raw, str) else ""

    try:
        result = extract_permit(text)
    except ExtractionUnavailable as exc:
        raise AppError(400, "EMPTY_INPUT", "Provide permit text or a PDF file") from exc

    record = store.new_draft(
        lambda draft_id: DraftRecord(
            draft_id=draft_id,
            source_text=text.strip(),
            llm_mode_used=result.llm_mode_used,
            fields=dict(result.fields),
        )
    )
    return _view(store, record)


@router.patch(
    "/permits/{draft_id}",
    response_model=PermitDraft,
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def patch_draft(draft_id: str, body: PatchDraftRequest, store: StoreDep) -> PermitDraft:
    record = _get_draft(store, draft_id)
    if record.committed_work_id:
        raise AppError(409, "DRAFT_ALREADY_COMMITTED", f"{draft_id} is already in the plan")
    unknown = [n for n in body.fields if n not in FIELD_NAMES]
    if unknown:
        raise AppError(422, "UNKNOWN_FIELD", f"Unknown field(s): {', '.join(unknown)}")
    try:
        apply_edits(record.fields, dict(body.fields))
    except InvalidFieldValue as exc:
        raise AppError(422, "INVALID_FIELD_VALUE", str(exc)) from exc
    return _view(store, record)


@router.post(
    "/permits/{draft_id}/commit",
    response_model=CommitResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def commit_draft(draft_id: str, body: CommitRequest, store: StoreDep) -> CommitResponse:
    """Add the permit's work to the coordination plan. This is not a permit approval."""
    record = _get_draft(store, draft_id)
    if record.committed_work_id:
        raise AppError(409, "DRAFT_ALREADY_COMMITTED", f"{draft_id} is already in the plan")
    geo = geocode(record.fields)
    if geo.status == "FAILED":
        raise AppError(422, "GEOCODE_FAILED", "; ".join(geo.notes))
    try:
        work = build_work(record.fields, geo, store.next_work_id(), get_settings().demo_date)
    except DraftIncomplete as exc:
        raise AppError(422, "DRAFT_INCOMPLETE", str(exc)) from exc

    new_ids = store.add_work(work)
    record.committed_work_id = work.id
    audit = store.log_audit(
        body.reviewer.strip(),
        "PERMIT_COMMIT",
        work.id,
        f"Permit {work.source_permit.permit_no} ({work.agency}) added to coordination plan as "
        f"{work.id}; {len(new_ids)} clash(es) for review",
    )
    return CommitResponse(work=work, new_clash_ids=new_ids, audit=audit)
