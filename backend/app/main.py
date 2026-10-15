from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import routes_clashes, routes_scene
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


@app.exception_handler(AppError)
def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
    )


class HealthResponse(ApiModel):
    status: Literal["ok"]
    version: str
    llm_mode: Literal["cached", "live"]
    demo_date: date


@app.get("/api/health", response_model=HealthResponse)
def health(s: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(status="ok", version=VERSION, llm_mode=s.llm_mode, demo_date=s.demo_date)
