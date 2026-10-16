import csv
import io

from fastapi.testclient import TestClient

from app.report.builder import CSV_FILENAME, DISCLAIMER


def test_default_format_is_inline_html(api: TestClient) -> None:
    res = api.get("/api/report")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    assert "content-disposition" not in res.headers
    assert DISCLAIMER in res.text


def test_html_format_matches_default(api: TestClient) -> None:
    a = api.get("/api/report?format=html").text
    assert "Unresolved: 13 of 13" in a


def test_csv_is_attachment_with_contract_filename(api: TestClient) -> None:
    res = api.get("/api/report?format=csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["content-disposition"] == f'attachment; filename="{CSV_FILENAME}"'
    assert CSV_FILENAME == "subterra-clash-report.csv"
    rows = list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert len(rows) == 13


def test_unknown_format_is_validation_error(api: TestClient) -> None:
    res = api.get("/api/report?format=pdf")
    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"


def test_report_reflects_review_and_reset(api: TestClient) -> None:
    cid = api.get("/api/clashes").json()["items"][0]["id"]
    api.post(
        f"/api/clashes/{cid}/review",
        json={"action": "DISMISS", "reviewer": "A. Sharma", "note": "same trench, see CLH-0002"},
    )
    html = api.get("/api/report").text
    assert "same trench, see CLH-0002" in html and "Unresolved: 12 of 13" in html
    api.post("/api/reset")
    assert "Unresolved: 13 of 13" in api.get("/api/report").text
