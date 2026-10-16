"""Report context + renderers. Pure: data in, text out (the route supplies the store snapshot)."""

import csv
import io
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.engine.summary import build_summary
from app.models import Asset, AuditEntry, Clash, ClashGroup, Rule, Scene, TruthCase, Work
from app.models.summary import Summary

DISCLAIMER = (
    "Decision-support output from synthetic data. Clearance values are illustrative. "
    "No permit has been approved or rejected by this tool; all findings require engineering "
    "review and field verification."
)
FALLBACK_AREA = "Navgarh — Sector 7"
IST = timezone(timedelta(hours=5, minutes=30), "IST")
CSV_FILENAME = "subterra-clash-report.csv"

CSV_COLUMNS = [
    "rank",
    "clash_id",
    "group_id",
    "kind",
    "certainty",
    "severity_score",
    "severity_band",
    "work_ids",
    "work_titles",
    "asset_ids",
    "asset_labels",
    "x",
    "y",
    "z",
    "measured_gap_m",
    "required_clearance_m",
    "uncertainty_m",
    "rule_id",
    "missing_data",
    "review_status",
    "reviewer",
    "note",
    "review_updated_at",
    "explanation",
]

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=True,
    trim_blocks=True,
    lstrip_blocks=True,
)


def format_ist(moment: datetime | None) -> str:
    """'16 Oct 2026, 06:45 IST' (naive datetimes are taken as UTC); '' for None."""
    if moment is None:
        return ""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    local = moment.astimezone(IST)
    return f"{local.day} {local:%b %Y, %H:%M} IST"


_env.filters["ist"] = format_ist


@dataclass(frozen=True)
class ReportRow:
    rank: int
    clash: Clash
    group_title: str
    assets: list[Asset]
    works: list[Work]
    rule: Rule | None


@dataclass(frozen=True)
class ReportContext:
    area_name: str
    generated_at: datetime
    demo_date: date
    summary: Summary
    total: int
    rows: list[ReportRow]
    audit: list[AuditEntry]  # oldest first

    @property
    def unresolved(self) -> int:
        return self.summary.counts.open


def _clash_num(clash_id: str) -> int:
    return int(clash_id.rsplit("-", 1)[1])


def build_report_context(
    *,
    scene: Scene,
    clashes: Sequence[Clash],
    groups: Sequence[ClashGroup],
    rules: Sequence[Rule],
    truth: Sequence[TruthCase],
    baseline_pairs: set[tuple[str, str]],
    demo_date: date,
    now: datetime,
    audit: Sequence[AuditEntry] = (),
) -> ReportContext:
    """All clashes (resolved too) in review order; summary counts follow the unresolved rule."""
    group_rank = {g.id: g.review_rank for g in groups}
    group_title = {g.id: g.title for g in groups}
    assets = {a.id: a for a in scene.assets}
    works = {w.id: w for w in scene.works}
    rule_by_id = {r.id: r for r in rules}

    ordered = sorted(
        clashes,
        key=lambda c: (group_rank.get(c.group_id, 10**6), -c.severity.score, _clash_num(c.id)),
    )
    rows = [
        ReportRow(
            rank=i,
            clash=c,
            group_title=group_title.get(c.group_id, c.group_id),
            assets=[assets[a] for a in c.asset_ids if a in assets],
            works=[works[w] for w in c.work_ids if w in works],
            rule=rule_by_id.get(c.rule_id) if c.rule_id else None,
        )
        for i, c in enumerate(ordered, start=1)
    ]
    return ReportContext(
        area_name=scene.area.name.strip() or FALLBACK_AREA,
        generated_at=now,
        demo_date=demo_date,
        summary=build_summary(clashes, scene.assets, truth, baseline_pairs),
        total=len(rows),
        rows=rows,
        audit=sorted(audit, key=lambda a: (a.at, a.id)),
    )


def render_html(ctx: ReportContext) -> str:
    return _env.get_template("report.html.j2").render(ctx=ctx, disclaimer=DISCLAIMER)


def _text(value: str | None) -> str:
    """Free text cell: neutralise spreadsheet formulas. Numeric cells never pass through here."""
    if not value:
        return ""
    return f"'{value}" if value.startswith(_FORMULA_PREFIXES) else value


def _num(value: float | None) -> float | str:
    """Numeric cell: a real number (negative gaps stay numbers), blank when missing."""
    return "" if value is None else round(value, 3)


def render_csv(ctx: ReportContext) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for row in ctx.rows:
        c = row.clash
        writer.writerow(
            [
                row.rank,
                _text(c.id),
                _text(c.group_id),
                c.kind.value,
                c.certainty.value,
                c.severity.score,
                c.severity.band.value,
                _text("; ".join(c.work_ids)),
                _text("; ".join(w.title for w in row.works)),
                _text("; ".join(c.asset_ids)),
                _text("; ".join(a.label for a in row.assets)),
                _num(c.location.x),
                _num(c.location.y),
                _num(c.location.z),
                _num(c.measured_gap_m),
                _num(c.required_clearance_m),
                _num(c.uncertainty_m),
                _text(c.rule_id),
                _text("; ".join(c.missing_data)),
                c.review.status.value,
                _text(c.review.reviewer),
                _text(c.review.note),
                format_ist(c.review.updated_at),
                _text(c.explanation),
            ]
        )
    return out.getvalue()
