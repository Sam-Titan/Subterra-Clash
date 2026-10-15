from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app, cors_origins


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield TestClient(app)
    app.dependency_overrides.clear()


def _override(**values: object) -> None:
    settings = Settings(_env_file=None, **values)  # type: ignore[arg-type]
    app.dependency_overrides[get_settings] = lambda: settings


def test_health_shape_and_values(client: TestClient) -> None:
    _override(llm_mode="cached", demo_date="2026-10-28")
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ok",
        "version": "0.1.0",
        "llm_mode": "cached",
        "demo_date": "2026-10-28",
    }


def test_health_reflects_settings(client: TestClient) -> None:
    _override(llm_mode="live", demo_date="2026-01-02")
    body = client.get("/api/health").json()
    assert body["llm_mode"] == "live"
    assert date.fromisoformat(body["demo_date"]) == date(2026, 1, 2)


def test_settings_have_defaults_without_env_file() -> None:
    s = Settings(_env_file=None)
    assert s.llm_mode == "cached"
    assert s.demo_date == date(2026, 10, 28)
    assert s.frontend_origin == "http://localhost:5173"


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
def test_cors_allows_frontend_origin(client: TestClient, origin: str) -> None:
    res = client.get("/api/health", headers={"Origin": origin})
    assert res.headers["access-control-allow-origin"] == origin


def test_cors_rejects_unrelated_origin(client: TestClient) -> None:
    res = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_cors_origins_primary_first_and_deduplicated() -> None:
    assert cors_origins("http://localhost:5173") == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    assert cors_origins("http://127.0.0.1:5173") == [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    assert cors_origins("https://demo.example") == ["https://demo.example"]
