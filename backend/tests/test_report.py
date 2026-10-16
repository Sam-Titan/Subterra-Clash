import csv
import io
import time
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.routes_report import report_context
from app.config import get_settings
from app.data.loader import load_rules, load_scene
from app.engine.analyze import analyze
from app.models import Clash
from app.models.enums import ReviewAction
from app.report.builder import (
    CSV_COLUMNS,
    DISCLAIMER,
    ReportContext,
    build_report_context,
    format_ist,
    render_csv,
    render_html,
)
from app.store import Store


def _parse(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def _review(store: Store, cid: str, action: str, note: str | None = None) -> None:
    assert store.review_clash(cid, ReviewAction(action), "A. Sharma", note) is not None


def _empty_ctx(store: Store) -> ReportContext:
    return build_report_context(
        scene=store.scene,
        clashes=[],
        groups=[],
        rules=store.rules,
        truth=[],
        baseline_pairs=set(),
        demo_date=get_settings().demo_date,
        now=datetime(2026, 10, 16, 1, 15, tzinfo=UTC),
    )


def test_format_ist() -> None:
    assert format_ist(datetime(2026, 10, 16, 1, 15, tzinfo=UTC)) == "16 Oct 2026, 06:45 IST"
    assert format_ist(datetime(2026, 10, 16, 20, 0, tzinfo=UTC)) == "17 Oct 2026, 01:30 IST"
    assert format_ist(None) == ""


def test_html_has_disclaimer_baseline_and_all_clashes(store: Store) -> None:
    html = render_html(report_context(store))
    assert html.count(DISCLAIMER) >= 1
    ids = [c.id for c in store.clashes()]
    assert len(ids) == 13 and all(i in html for i in ids)
    assert "Unresolved: 13 of 13" in html
    assert "Naive 2D baseline" in html and "0.67" in html and "0.40" in html
    assert "CLEARANCE · NEEDS_DATA" in html
    stripped = html.replace(DISCLAIMER, "").lower()
    assert "approve" not in stripped and "reject" not in stripped


def test_html_lists_resolved_clashes_but_counts_unresolved(store: Store) -> None:
    cid = store.clashes()[0].id
    _review(store, cid, "DISMISS", "Duplicate of CLH-0002")
    html = render_html(report_context(store))
    assert cid in html and "Duplicate of CLH-0002" in html and "DISMISSED" in html
    assert "Unresolved: 12 of 13" in html


def test_html_escapes_reviewer_text(store: Store) -> None:
    _review(store, store.clashes()[0].id, "ACKNOWLEDGE", "<script>alert(1)</script>")
    html = render_html(report_context(store))
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html


def test_html_renders_review_time_in_ist(store: Store) -> None:
    _review(store, store.clashes()[0].id, "ACKNOWLEDGE", "ok")
    assert " IST" in render_html(report_context(store))


def test_csv_rows_in_review_order_with_blank_missing_numbers(store: Store) -> None:
    rows = _parse(render_csv(report_context(store)))
    assert list(rows[0].keys()) == CSV_COLUMNS
    assert len(rows) == 13
    assert [int(r["rank"]) for r in rows] == list(range(1, 14))
    by_id = {c.id: c for c in store.clashes()}
    for r in rows:
        c: Clash = by_id[r["clash_id"]]
        assert (r["measured_gap_m"] == "") == (c.measured_gap_m is None)


def test_csv_guard_hits_free_text_only_and_negative_gap_stays_numeric(store: Store) -> None:
    negative = next(c for c in store.clashes() if (c.measured_gap_m or 0) < 0)
    _review(store, negative.id, "ACKNOWLEDGE", '=HYPERLINK("http://x")')
    rows = _parse(render_csv(report_context(store)))
    row = next(r for r in rows if r["clash_id"] == negative.id)
    assert row["note"] == '\'=HYPERLINK("http://x")'
    assert row["measured_gap_m"] == str(round(negative.measured_gap_m or 0, 3))
    assert row["measured_gap_m"].startswith("-")
    assert float(row["measured_gap_m"]) < 0
    assert not row["z"].startswith("'")


def test_csv_review_time_in_ist(store: Store) -> None:
    cid = store.clashes()[0].id
    _review(store, cid, "ESCALATE", "gas")
    row = next(r for r in _parse(render_csv(report_context(store))) if r["clash_id"] == cid)
    assert row["review_updated_at"].endswith(" IST")


def test_empty_results_render(store: Store) -> None:
    ctx = _empty_ctx(store)
    assert "No clashes found" in render_html(ctx)
    assert "Unresolved: 0 of 0" in render_html(ctx)
    assert _parse(render_csv(ctx)) == []
    assert render_csv(ctx).splitlines() == [",".join(CSV_COLUMNS)]


def test_seed_analysis_and_report_under_one_second(store: Store) -> None:
    scene, rules = load_scene(), load_rules()
    t0 = time.perf_counter()
    analyze(scene, rules, get_settings().demo_date)
    assert time.perf_counter() - t0 < 1.0
    t0 = time.perf_counter()
    ctx = report_context(store)
    render_html(ctx)
    render_csv(ctx)
    assert time.perf_counter() - t0 < 1.0


def test_report_route_registered(api: TestClient) -> None:
    assert api.get("/api/report").status_code == 200


def test_review_log_lists_events_oldest_first_and_escapes(store: Store) -> None:
    cid = store.clashes()[0].id
    assert "No review actions yet." in render_html(report_context(store))
    _review(store, cid, "DISMISS", "<b>dup</b> of other")
    _review(store, cid, "REOPEN", "needs another look")
    html = render_html(report_context(store))
    log = html.split("<h2>Review log</h2>")[1]
    assert "No review actions yet." not in log
    assert log.index("DISMISS") < log.index("REOPEN")
    assert log.index("&lt;b&gt;dup&lt;/b&gt; of other") < log.index("needs another look")
    assert "<b>dup</b>" not in html
    assert log.count(cid) == 2 and " IST" in log


def test_csv_has_no_review_log(store: Store) -> None:
    _review(store, store.clashes()[0].id, "ACKNOWLEDGE", "ok")
    assert len(_parse(render_csv(report_context(store)))) == 13
