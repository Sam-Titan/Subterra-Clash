from fastapi.testclient import TestClient

from app.models import Review, ReviewStatus
from app.store import Store


def test_scene_shape(api: TestClient) -> None:
    body = api.get("/api/scene").json()
    assert set(body) == {"area", "streets", "junctions", "landmarks", "assets", "works"}
    assert len(body["assets"]) == 72
    assert len(body["works"]) == 11
    assert body["area"]["name"] == "Navgarh — Sector 7"


def test_rules_in_match_order_with_disclaimer(api: TestClient) -> None:
    body = api.get("/api/rules").json()
    assert body["total"] == len(body["items"]) == 6
    assert body["items"][0]["id"].startswith("R-")
    assert "not a regulatory standard" in body["disclaimer"]
    assert set(body["items"][0]["applies_to"]) == {"work_types", "utility", "work_utility"}


def test_reset_restores_state(api: TestClient, store: Store) -> None:
    store.set_review("CLH-0001", Review(status=ReviewStatus.ESCALATED, reviewer="X"))
    assert api.get("/api/clashes?status=ESCALATED").json()["total"] == 1
    assert api.post("/api/reset").json() == {"status": "reset"}
    assert api.get("/api/clashes?status=ESCALATED").json()["total"] == 0
    assert api.get("/api/clashes").json()["total"] == 13
