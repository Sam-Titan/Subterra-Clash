from collections import Counter

import pymupdf
from fastapi.testclient import TestClient

from app.permits.sample_permits import SAMPLE_PERMITS, SAMPLES_DIR
from app.store import Store


def _parse(api: TestClient, index: int) -> dict:
    res = api.post("/api/permits/parse", json={"text": SAMPLE_PERMITS[index].text})
    assert res.status_code == 200, res.text
    return res.json()


def _commit(api: TestClient, draft_id: str):
    return api.post(f"/api/permits/{draft_id}/commit", json={"reviewer": "A. Sharma"})


def _new_mix(api: TestClient, ids: list[str]) -> Counter[tuple[str, str]]:
    by_id = {c["id"]: c for c in api.get("/api/clashes").json()["items"]}
    return Counter((by_id[i]["certainty"], by_id[i]["kind"]) for i in ids)


def test_samples(api: TestClient) -> None:
    body = api.get("/api/permits/samples").json()
    assert body["total"] == 3
    assert [i["id"] for i in body["items"]] == ["sample-1", "sample-2", "sample-3"]
    assert set(body["items"][0]) == {"id", "title", "text"}


def test_parse_text_returns_draft_without_touching_plan(api: TestClient, store: Store) -> None:
    before = len(store.scene.works)
    d = _parse(api, 0)
    assert d["draft_id"] == "PRM-0001"
    assert d["llm_mode_used"] == "cached"
    assert d["geocode"]["status"] == "RESOLVED"
    assert d["geocode"]["path"] == [[180.0, 206.0], [420.0, 206.0]]
    assert d["missing_fields"] == ["offset_m", "diameter_m"]
    assert d["preview_clash_count"] > 0
    assert len(store.scene.works) == before
    assert len(api.get("/api/clashes").json()["items"]) == 13
    assert _parse(api, 1)["draft_id"] == "PRM-0002"


def test_parse_pdf_upload(api: TestClient) -> None:
    pdf = (SAMPLES_DIR / "sample-2.pdf").read_bytes()
    res = api.post("/api/permits/parse", files={"file": ("p.pdf", pdf, "application/pdf")})
    assert res.status_code == 200
    assert res.json()["fields"]["permit_no"]["value"] == "JB/2026/0457"


def test_parse_errors(api: TestClient) -> None:
    for payload in ({"text": "   "}, {}):
        res = api.post("/api/permits/parse", json=payload)
        assert (res.status_code, res.json()["code"]) == (400, "EMPTY_INPUT")
    big = b"%PDF-" + b"0" * (5 * 1024 * 1024 + 1)
    res = api.post("/api/permits/parse", files={"file": ("big.pdf", big, "application/pdf")})
    assert (res.status_code, res.json()["code"]) == (413, "FILE_TOO_LARGE")
    blank = pymupdf.open()
    blank.new_page()
    res = api.post(
        "/api/permits/parse",
        files={"file": ("blank.pdf", blank.tobytes(), "application/pdf")},
    )
    assert (res.status_code, res.json()["code"]) == (422, "PDF_NO_TEXT")


def test_patch_edits_and_regeocodes(api: TestClient) -> None:
    d = _parse(api, 0)
    res = api.patch(
        f"/api/permits/{d['draft_id']}", json={"fields": {"offset_m": 2, "side": "south"}}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["fields"]["offset_m"] == {
        "value": 2.0,
        "confidence": 1.0,
        "source_quote": "edited by reviewer",
    }
    assert body["geocode"]["path"] == [[180.0, 198.0], [420.0, 198.0]]
    assert "offset_m" not in body["missing_fields"]


def test_patch_errors(api: TestClient) -> None:
    d = _parse(api, 0)
    url = f"/api/permits/{d['draft_id']}"
    assert api.patch(url, json={"fields": {"colour": "red"}}).json()["code"] == "UNKNOWN_FIELD"
    res = api.patch(url, json={"fields": {"street": "Mall Road"}})
    assert (res.status_code, res.json()["code"]) == (422, "INVALID_FIELD_VALUE")
    res = api.patch("/api/permits/PRM-9999", json={"fields": {}})
    assert (res.status_code, res.json()["code"]) == (404, "DRAFT_NOT_FOUND")


def test_commit_adds_work_keeps_ids_stable_and_logs_audit(api: TestClient, store: Store) -> None:
    old = {c["id"]: c for c in api.get("/api/clashes").json()["items"]}
    d = _parse(api, 0)
    res = _commit(api, d["draft_id"])
    assert res.status_code == 200
    body = res.json()
    assert body["work"]["origin"] == "INTAKE"
    assert body["work"]["id"] == "WRK-012"
    assert body["new_clash_ids"]
    assert len(body["new_clash_ids"]) == d["preview_clash_count"]
    assert not set(body["new_clash_ids"]) & set(old)
    now = {c["id"]: c for c in api.get("/api/clashes").json()["items"]}
    assert all(now[i]["kind"] == old[i]["kind"] for i in old)
    assert body["audit"]["action"] == "PERMIT_COMMIT"
    assert body["audit"]["actor"] == "A. Sharma"
    assert "coordination plan" in body["audit"]["detail"]
    assert "WRK-012" in {w["id"] for w in api.get("/api/scene").json()["works"]}

    assert _commit(api, d["draft_id"]).json()["code"] == "DRAFT_ALREADY_COMMITTED"
    api.post("/api/reset")
    assert "WRK-012" not in {w["id"] for w in api.get("/api/scene").json()["works"]}
    assert len(api.get("/api/clashes").json()["items"]) == 13


def test_commit_errors(api: TestClient) -> None:
    assert _commit(api, "PRM-9999").json()["code"] == "DRAFT_NOT_FOUND"
    d = _parse(api, 0)
    api.patch(f"/api/permits/{d['draft_id']}", json={"fields": {"to_ref": None}})
    res = _commit(api, d["draft_id"])
    assert (res.status_code, res.json()["code"]) == (422, "GEOCODE_FAILED")
    d = _parse(api, 0)
    api.patch(f"/api/permits/{d['draft_id']}", json={"fields": {"start_date": None}})
    res = _commit(api, d["draft_id"])
    assert (res.status_code, res.json()["code"]) == (422, "DRAFT_INCOMPLETE")


def test_sample2_demo_outcome_is_locked(api: TestClient) -> None:
    """Demo permit (Hinglish PDF): at least one LIKELY and one POSSIBLE / NEEDS_DATA clash."""
    pdf = (SAMPLES_DIR / "sample-2.pdf").read_bytes()
    d = api.post("/api/permits/parse", files={"file": ("p.pdf", pdf, "application/pdf")}).json()
    ids = _commit(api, d["draft_id"]).json()["new_clash_ids"]
    mix = _new_mix(api, ids)
    assert mix == Counter({("LIKELY", "INTERSECTION"): 2, ("POSSIBLE", "INTERSECTION"): 1})


def test_sample3_missing_depth_gives_only_needs_data(api: TestClient) -> None:
    d = _parse(api, 2)
    assert d["geocode"]["status"] == "PARTIAL"
    ids = _commit(api, d["draft_id"]).json()["new_clash_ids"]
    mix = _new_mix(api, ids)
    assert mix == Counter({("NEEDS_DATA", "CLEARANCE"): 7})
    detail = api.get(f"/api/clashes/{ids[0]}").json()["clash"]
    assert detail["measured_gap_m"] is None
    assert detail["uncertainty_m"] is None
    assert (
        detail["missing_data"] == ["WRK-012.depth"] or detail["missing_data"][-1] == "WRK-012.depth"
    )


def test_sample1_mix_is_stable(api: TestClient) -> None:
    ids = _commit(api, _parse(api, 0)["draft_id"]).json()["new_clash_ids"]
    assert _new_mix(api, ids) == Counter(
        {
            ("POSSIBLE", "INTERSECTION"): 5,
            ("POSSIBLE", "CLEARANCE"): 3,
            ("LIKELY", "SCHEDULE_OVERLAP"): 1,
        }
    )
