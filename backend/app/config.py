from datetime import date
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_mode: Literal["cached", "live"] = "cached"
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5-5"
    anthropic_api_key: str = ""
    demo_date: date = date(2026, 10, 28)
    frontend_origin: str = "http://localhost:5173"
    trusted_proxy_hops: int = Field(default=0, ge=0)
    trust_cf_headers: bool = False
    log_client_ip: Literal["full", "masked", "off"] = "masked"
    debug_headers: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
