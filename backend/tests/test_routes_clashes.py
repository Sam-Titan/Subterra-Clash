from fastapi.testclient import TestClient


def _ids(api: TestClient, query: str = "") -> list[str]:
    return [c["id"] for c in api.get(f"/api/clashes{query}").json()["items"]]


def test_list_default_sort_is_review_rank_and_deterministic(api: TestClient) -> None:
    body = api.get("/api/clashes").json()
    assert body["total"] == len(body["items"]) == 13
    groups = {g["id"]: g["review_rank"] for g in api.get("/api/groups").json()["items"]}
    ranks = [groups[c["group_id"]] for c in body["items"]]
    assert ranks == sorted(ranks)
    assert _ids(api) == _ids(api)


def test_sort_id_and_severity(api: TestClient) -> None:
    ids = _ids(api, "?sort=id")
    assert ids == sorted(ids)
    scores = [c["severity"]["score"] for c in api.get("/api/clashes?sort=severity").json()["items"]]
    assert scores == sorted(scores, reverse=True)


def test_invalid_sort_rejected(api: TestClient) -> None:
    assert api.get("/api/clashes?sort=nope").status_code == 422


def test_filter_certainty_counts(api: TestClient) -> None:
    assert len(_ids(api, "?certainty=LIKELY")) == 11
    assert len(_ids(api, "?certainty=POSSIBLE")) == 1
    assert len(_ids(api, "?certainty=NEEDS_DATA")) == 1


def test_filter_kind_band_status(api: TestClient) -> None:
    assert len(_ids(api, "?kind=INTERSECTION")) == 7
    assert len(_ids(api, "?kind=SCHEDULE_OVERLAP")) == 1
    assert len(_ids(api, "?band=CRITICAL")) == 6
    assert len(_ids(api, "?status=OPEN")) == 13
    assert _ids(api, "?status=DISMISSED") == []


def test_filter_work_group_utility(api: TestClient) -> None:
    items = api.get("/api/clashes?work_id=WRK-001").json()["items"]
    assert items
    assert all("WRK-001" in c["work_ids"] for c in items)
    gid = items[0]["group_id"]
    in_group = api.get(f"/api/clashes?group_id={gid}").json()["items"]
    assert in_group
    assert all(c["group_id"] == gid for c in in_group)
    gas = api.get("/api/clashes?utility=GAS").json()["items"]
    assert len(gas) == 2
    assert all(c["asset_ids"] for c in gas)


def test_combined_filters_are_anded(api: TestClient) -> None:
    both = set(_ids(api, "?certainty=LIKELY&kind=INTERSECTION"))
    assert both == set(_ids(api, "?certainty=LIKELY")) & set(_ids(api, "?kind=INTERSECTION"))


def test_detail_expands_refs(api: TestClient) -> None:
    body = api.get("/api/clashes/CLH-0001").json()
    clash = body["clash"]
    assert clash["id"] == "CLH-0001"
    assert [a["id"] for a in body["assets"]] == clash["asset_ids"]
    assert [w["id"] for w in body["works"]] == clash["work_ids"]
    assert body["rule"]["id"] == clash["rule_id"]
    assert body["rule"]["min_clearance_m"] == clash["required_clearance_m"]


def test_schedule_clash_detail_has_null_rule(api: TestClient) -> None:
    sched = api.get("/api/clashes?kind=SCHEDULE_OVERLAP").json()["items"][0]
    body = api.get(f"/api/clashes/{sched['id']}").json()
    assert body["rule"] is None
    assert body["assets"] == []
    assert len(body["works"]) == 2


def test_unknown_clash_404_shape(api: TestClient) -> None:
    res = api.get("/api/clashes/CLH-9999")
    assert res.status_code == 404
    assert res.json() == {"detail": "No clash with id CLH-9999", "code": "CLASH_NOT_FOUND"}


def test_groups_ordered_and_reference_real_clashes(api: TestClient) -> None:
    body = api.get("/api/groups").json()
    assert body["total"] == len(body["items"]) == 8
    assert [g["review_rank"] for g in body["items"]] == list(range(1, 9))
    known = set(_ids(api))
    assert all(set(g["clash_ids"]) <= known for g in body["items"])
