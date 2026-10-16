from fastapi.testclient import TestClient

from app.permits.sample_permits import SAMPLE_PERMITS


def _summary(api: TestClient) -> dict:  # type: ignore[type-arg]
    res = api.get("/api/summary")
    assert res.status_code == 200
    return res.json()


def _review(api: TestClient, cid: str, action: str) -> None:
    res = api.post(
        f"/api/clashes/{cid}/review",
        json={"action": action, "reviewer": "A. Sharma", "note": "checked"},
    )
    assert res.status_code == 200


def test_seed_counts_match_clashes(api: TestClient) -> None:
    s = _summary(api)
    items = api.get("/api/clashes").json()["items"]
    c = s["counts"]
    assert c["open"] == len(items) == 13
    assert c["critical"] == sum(i["severity"]["band"] == "CRITICAL" for i in items)
    assert c["high"] == sum(i["severity"]["band"] == "HIGH" for i in items)
    assert c["needs_data"] == sum(i["certainty"] == "NEEDS_DATA" for i in items)
    assert c["dig_once"] == 1 and c["schedule_overlap"] == 1
    assert sum(x["count"] for x in s["by_certainty"]) == c["open"]
    assert [x["utility"] for x in s["by_utility"]] == sorted(x["utility"] for x in s["by_utility"])


def test_evaluation_matches_spec(api: TestClient) -> None:
    ev = _summary(api)["evaluation"]
    assert ev["ours"] == {
        "true_positives": 5,
        "false_alarms": 0,
        "misses": 0,
        "precision": 1.0,
        "recall": 1.0,
    }
    assert ev["baseline"] == {
        "true_positives": 2,
        "false_alarms": 1,
        "misses": 3,
        "precision": 0.67,
        "recall": 0.4,
    }
    cases = {c["case_id"]: c for c in ev["cases"]}
    assert len(cases) == 9
    t6 = cases["T6"]
    assert (t6["expected"], t6["expected_certainty"]) == ("CLEARANCE", "NEEDS_DATA")
    assert (t6["ours"], t6["ours_certainty"]) == ("CLEARANCE", "NEEDS_DATA")
    assert t6["baseline"] == "FLAGGED"
    for cid in ("T4", "T9"):
        assert cases[cid]["expected"] == cases[cid]["ours"] == "NO_CLASH"
        assert cases[cid]["expected_certainty"] is None
        assert cases[cid]["ours_certainty"] is None
    assert cases["T4"]["baseline"] == "FLAGGED"
    assert cases["T7"]["ours"] == "SCHEDULE_OVERLAP"
    assert cases["T8"]["ours"] == "DIG_ONCE"


def test_escalate_keeps_open_acknowledge_decreases(api: TestClient) -> None:
    ids = [c["id"] for c in api.get("/api/clashes").json()["items"]]
    before = _summary(api)["counts"]["open"]
    _review(api, ids[0], "ESCALATE")
    assert _summary(api)["counts"]["open"] == before
    _review(api, ids[1], "ACKNOWLEDGE")
    assert _summary(api)["counts"]["open"] == before - 1
    _review(api, ids[2], "DISMISS")
    assert _summary(api)["counts"]["open"] == before - 2
    _review(api, ids[1], "REOPEN")
    assert _summary(api)["counts"]["open"] == before - 1


def test_evaluation_ignores_review_status_and_commit(api: TestClient) -> None:
    ev = _summary(api)["evaluation"]
    for c in api.get("/api/clashes").json()["items"]:
        _review(api, c["id"], "DISMISS")
    s = _summary(api)
    assert s["counts"]["open"] == 0 and s["by_utility"] == [] and s["by_certainty"] == []
    assert s["evaluation"] == ev
    api.post("/api/reset")
    draft = api.post("/api/permits/parse", json={"text": SAMPLE_PERMITS[1].text}).json()
    api.post(f"/api/permits/{draft['draft_id']}/commit", json={"reviewer": "A. Sharma"})
    after = _summary(api)
    assert after["counts"]["open"] > 13
    assert after["evaluation"] == ev
