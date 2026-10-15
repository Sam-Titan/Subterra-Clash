from fastapi.testclient import TestClient

from app.permits.sample_permits import SAMPLE_PERMITS

ACTIONS = {
    "ACKNOWLEDGE": "ACKNOWLEDGED",
    "ESCALATE": "ESCALATED",
    "DISMISS": "DISMISSED",
    "REOPEN": "OPEN",
}


def _first_id(api: TestClient) -> str:
    return api.get("/api/clashes").json()["items"][0]["id"]


def _review(api: TestClient, cid: str, action: str, reviewer: str = "A. Sharma", note=None):
    return api.post(
        f"/api/clashes/{cid}/review", json={"action": action, "reviewer": reviewer, "note": note}
    )


def test_each_action_sets_status_and_audit(api: TestClient) -> None:
    cid = _first_id(api)
    for action, status in ACTIONS.items():
        res = _review(api, cid, action, note="field check booked")
        assert res.status_code == 200
        body = res.json()
        assert body["clash"]["review"]["status"] == status
        assert body["clash"]["review"]["reviewer"] == "A. Sharma"
        assert body["clash"]["review"]["note"] == "field check booked"
        assert body["clash"]["review"]["updated_at"]
        assert body["audit"]["action"] == action
        assert body["audit"]["target_id"] == cid
        assert body["audit"]["actor"] == "A. Sharma"
        assert body["clash"] == api.get(f"/api/clashes/{cid}").json()["clash"]


def test_note_optional_except_dismiss(api: TestClient) -> None:
    cid = _first_id(api)
    res = _review(api, cid, "ACKNOWLEDGE")
    assert res.status_code == 200
    assert res.json()["clash"]["review"]["note"] is None
    assert res.json()["audit"]["detail"] == "Marked ACKNOWLEDGED"
    res = _review(api, cid, "REOPEN")
    assert res.json()["clash"]["review"]["status"] == "OPEN"


def test_dismiss_requires_note_and_changes_nothing(api: TestClient) -> None:
    cid = _first_id(api)
    before = len(api.get("/api/audit").json()["items"])
    for note in (None, "", "   "):
        res = _review(api, cid, "DISMISS", note=note)
        assert res.status_code == 422
        assert res.json()["code"] == "NOTE_REQUIRED"
    assert api.get(f"/api/clashes/{cid}").json()["clash"]["review"]["status"] == "OPEN"
    assert len(api.get("/api/audit").json()["items"]) == before


def test_reopen_replaces_old_dismissal_note(api: TestClient) -> None:
    cid = _first_id(api)
    _review(api, cid, "DISMISS", note="duplicate of CLH-0002")
    review = _review(api, cid, "REOPEN").json()["clash"]["review"]
    assert review["status"] == "OPEN"
    assert review["note"] is None
    assert review["reviewer"] == "A. Sharma"


def test_blank_reviewer_rejected(api: TestClient) -> None:
    cid = _first_id(api)
    res = _review(api, cid, "ACKNOWLEDGE", reviewer="  ")
    assert res.status_code == 422
    assert res.json()["code"] == "REVIEWER_REQUIRED"


def test_unknown_clash_and_bad_action(api: TestClient) -> None:
    res = _review(api, "CLH-9999", "ACKNOWLEDGE")
    assert res.status_code == 404
    assert res.json()["code"] == "CLASH_NOT_FOUND"
    res = _review(api, _first_id(api), "APPROVE")
    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"


def test_status_filter_reflects_review(api: TestClient) -> None:
    cid = _first_id(api)
    _review(api, cid, "DISMISS", note="not relevant")
    items = api.get("/api/clashes?status=DISMISSED").json()["items"]
    assert [c["id"] for c in items] == [cid]


def test_review_survives_permit_commit_and_reset_clears(api: TestClient) -> None:
    cid = _first_id(api)
    _review(api, cid, "ESCALATE", note="gas main")
    draft = api.post("/api/permits/parse", json={"text": SAMPLE_PERMITS[0].text}).json()
    commit = api.post(f"/api/permits/{draft['draft_id']}/commit", json={"reviewer": "A. Sharma"})
    assert commit.status_code == 200
    assert api.get(f"/api/clashes/{cid}").json()["clash"]["review"]["status"] == "ESCALATED"
    api.post("/api/reset")
    assert api.get(f"/api/clashes/{cid}").json()["clash"]["review"]["status"] == "OPEN"


def test_audit_newest_first_with_all_action_kinds(api: TestClient) -> None:
    cid = _first_id(api)
    _review(api, cid, "ACKNOWLEDGE")
    draft = api.post("/api/permits/parse", json={"text": SAMPLE_PERMITS[0].text}).json()
    api.post(f"/api/permits/{draft['draft_id']}/commit", json={"reviewer": "R. Rao"})
    api.post("/api/reset")
    body = api.get("/api/audit").json()
    assert body["total"] == len(body["items"])
    assert [e["action"] for e in body["items"]] == ["RESET", "PERMIT_COMMIT", "ACKNOWLEDGE"]
    nums = [int(e["id"].split("-")[1]) for e in body["items"]]
    assert nums == sorted(nums, reverse=True)
    assert body["items"][0]["target_id"] is None
