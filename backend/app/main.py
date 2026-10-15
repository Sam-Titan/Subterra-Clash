from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import Settings, get_settings

VERSION = "0.1.0"

settings = get_settings()

app = FastAPI(title="Subterra Clash", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    llm_mode: Literal["cached", "live"]
    demo_date: date


@app.get("/api/health", response_model=HealthResponse)
def health(s: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(status="ok", version=VERSION, llm_mode=s.llm_mode, demo_date=s.demo_date)
