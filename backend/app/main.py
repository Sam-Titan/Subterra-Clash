from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import routes_clashes, routes_permits, routes_scene, routes_summary
from app.api.schemas import AppError
from app.config import Settings, get_settings
from app.models.base import ApiModel

VERSION = "0.1.0"

settings = get_settings()


def cors_origins(frontend_origin: str) -> list[str]:
    """Primary origin first, plus its localhost / 127.0.0.1 twin (distinct to browsers)."""
    twin = frontend_origin.replace("localhost", "127.0.0.1")
    if twin == frontend_origin:
        twin = frontend_origin.replace("127.0.0.1", "localhost")
    return list(dict.fromkeys([frontend_origin, twin]))


app = FastAPI(title="Subterra Clash", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(settings.frontend_origin),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(routes_scene.router)
app.include_router(routes_clashes.router)
app.include_router(routes_permits.router)
app.include_router(routes_summary.router)


@app.exception_handler(AppError)
def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
    )


@app.exception_handler(RequestValidationError)
def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    parts = []
    for err in exc.errors():
        loc = [str(p) for p in err["loc"] if p not in ("query", "path", "body")]
        parts.append(f"{'.'.join(loc) or 'request'}: {err['msg']}")
    return JSONResponse(
        status_code=422, content={"detail": "; ".join(parts), "code": "VALIDATION_ERROR"}
    )


_HTTP_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


@app.exception_handler(StarletteHTTPException)
def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _HTTP_CODES.get(exc.status_code, f"HTTP_{exc.status_code}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc.detail), "code": code},
        headers=exc.headers,
    )


class HealthResponse(ApiModel):
    status: Literal["ok"]
    version: str
    llm_mode: Literal["cached", "live"]
    demo_date: date


@app.get("/api/health", response_model=HealthResponse)
def health(s: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(status="ok", version=VERSION, llm_mode=s.llm_mode, demo_date=s.demo_date)
