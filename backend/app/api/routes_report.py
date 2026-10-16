from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, Response

from app.config import get_settings
from app.report.builder import (
    CSV_FILENAME,
    ReportContext,
    build_report_context,
    render_csv,
    render_html,
)
from app.store import Store, get_store

router = APIRouter(prefix="/api", tags=["report"])
StoreDep = Annotated[Store, Depends(get_store)]


def report_context(store: Store) -> ReportContext:
    return build_report_context(
        scene=store.scene,
        clashes=store.clashes(),
        groups=store.groups(),
        rules=store.rules,
        truth=store.truth,
        baseline_pairs=store.result.baseline_pairs,
        demo_date=get_settings().demo_date,
        now=datetime.now(UTC),
        audit=store.audit,
    )


@router.get("/report", response_class=Response)
def get_report(
    store: StoreDep,
    format: Annotated[Literal["html", "csv"], Query()] = "html",  # noqa: A002 - contract name
) -> Response:
    ctx = report_context(store)
    if format == "csv":
        # UTF-8 BOM so Excel opens non-ASCII text (the area name has an em dash) correctly.
        return Response(
            content="﻿" + render_csv(ctx),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{CSV_FILENAME}"'},
        )
    return HTMLResponse(render_html(ctx), headers={"Cache-Control": "no-store"})
