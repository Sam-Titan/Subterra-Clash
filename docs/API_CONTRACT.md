# Subterra Clash — API Contract

> Owner: **Sam**. The frontend never invents endpoints or fields; ask Sam to change this file first.
> Base URL: `http://localhost:8000` · all routes under `/api` · JSON · snake_case field names.
> Vite dev server proxies `/api` → `http://localhost:8000`, so the frontend always calls relative `/api/...`.
> Once the backend runs, the exact types come from FastAPI's OpenAPI schema:
> `backend` → `uv run python scripts/export_openapi.py` writes `shared/openapi.json`
> `frontend` → `pnpm gen:api` writes `src/api/schema.d.ts`. **Never hand-edit `schema.d.ts`.**
> Until then, the frontend uses `shared/mocks/*.json`, which follow this contract exactly.

Field definitions live in `docs/SPEC.md` §7. This file defines routes, params and response envelopes.

---

## Conventions
- Errors: HTTP status + `{ "detail": "human readable message", "code": "SNAKE_CASE_CODE" }`.
- Lists return `{ "items": [...], "total": n }`.
- Enums are UPPER_SNAKE strings exactly as in SPEC §7.
- Coordinates: `[x, y]` or `[x, y, z]` arrays in metres (SPEC §6).

---

## Health & meta

### `GET /api/health`
`{ "status": "ok", "version": "0.1.0", "llm_mode": "live" | "cached", "demo_date": "2026-10-28" }`

### `GET /api/rules`
`{ "items": [ { "id": "R-EXC-GAS", "applies_to": { "work_types": ["TRENCH","PIT","HDD"], "utility": ["GAS"], "work_utility": [] }, "min_clearance_m": 1.0, "label": "Excavation vs gas — hand-dig zone" } ], "total": 6, "disclaimer": "Illustrative values for this exercise; not a regulatory standard." }`
In `applies_to`, `utility` = utilities of the existing asset and `work_utility` = utility being installed by the work; an empty list means "any". Rules are listed in match order (first match wins, SPEC §7.4).

---

## Scene

### `GET /api/scene`
Everything the 3D view needs in one call.
```json
{
  "area": { "name": "Navgarh — Sector 7", "bounds": { "min_x": 0, "min_y": 0, "max_x": 600, "max_y": 400 } },
  "streets":   [ { "id": "ST-01", "name": "Station Road", "centerline": [[0,200],[600,200]], "width_m": 18 } ],
  "junctions": [ { "id": "JN-03", "name": "J3 — Vikas Marg × Station Road", "x": 180, "y": 200 } ],
  "landmarks": [ { "id": "LM-02", "name": "Bus Depot", "x": 420, "y": 214 } ],
  "assets":    [ /* Asset, SPEC §7.2 */ ],
  "works":     [ /* Work, SPEC §7.3 */ ]
}
```

---

## Clashes

### `GET /api/clashes`
Query params (all optional): `kind`, `certainty`, `band`, `status`, `utility`, `work_id`, `group_id`, `sort` (`review_rank` default | `severity` | `id`).
Response: `{ "items": [Clash], "total": n }` — Clash per SPEC §7.5.

### `GET /api/clashes/{clash_id}`
`Clash` plus expanded refs:
```json
{ "clash": { /* Clash */ }, "assets": [ /* Asset */ ], "works": [ /* Work */ ], "rule": { /* Rule */ } | null }
```
`rule` is `null` for `SCHEDULE_OVERLAP` clashes (no clearance rule applies; `clash.rule_id` is also `null`). Unknown id → `404 { code: "CLASH_NOT_FOUND" }`.

### `POST /api/clashes/{clash_id}/review`
Request:
```json
{ "action": "ACKNOWLEDGE" | "ESCALATE" | "DISMISS" | "REOPEN", "reviewer": "A. Sharma", "note": "Field check booked for 2 Nov" }
```
`DISMISS` requires a non-empty `note` → else `422 { code: "NOTE_REQUIRED" }`.
Response: `{ "clash": Clash, "audit": AuditEntry }`

### `GET /api/groups`
`{ "items": [ { "id": "GRP-03", "title": "Station Road fibre trench — 3 clashes", "clash_ids": [...], "work_ids": [...], "max_severity_score": 91, "review_rank": 1 } ], "total": n }`

---

## Permit intake

### `POST /api/permits/parse`
Either `multipart/form-data` with `file` (PDF ≤ 5 MB) **or** JSON `{ "text": "..." }`.
Response — a **draft**, nothing is saved to the plan yet:
```json
{
  "draft_id": "PRM-0004",
  "source_text": "NVVN Discom — permit 2026/STN/114. Lay 11kV cable by open trench along north side of Station Road from J3 to Bus Depot, approx 1.2 m deep, 0.6 m wide. Work 3–20 Nov 2026.",
  "llm_mode_used": "live" | "cached",
  "fields": {
    "agency":      { "value": "NVVN Discom", "confidence": 0.97, "source_quote": "NVVN Discom" },
    "permit_no":   { "value": "2026/STN/114", "confidence": 0.98, "source_quote": "permit 2026/STN/114" },
    "work_type":   { "value": "TRENCH", "confidence": 0.9, "source_quote": "open trench" },
    "utility":     { "value": "POWER", "confidence": 0.93, "source_quote": "11kV cable" },
    "street":      { "value": "ST-01", "confidence": 0.95, "source_quote": "Station Road" },
    "from_ref":    { "value": "JN-03", "confidence": 0.88, "source_quote": "from J3" },
    "to_ref":      { "value": "LM-02", "confidence": 0.86, "source_quote": "to Bus Depot" },
    "side":        { "value": "NORTH", "confidence": 0.92, "source_quote": "north side" },
    "offset_m":    { "value": null, "confidence": 0, "source_quote": null },
    "depth_from_m":{ "value": 0.0, "confidence": 0.6, "source_quote": "approx 1.2 m deep" },
    "depth_to_m":  { "value": 1.2, "confidence": 0.7, "source_quote": "approx 1.2 m deep" },
    "width_m":     { "value": 0.6, "confidence": 0.9, "source_quote": "0.6 m wide" },
    "diameter_m":  { "value": null, "confidence": 0, "source_quote": null },
    "start_date":  { "value": "2026-11-03", "confidence": 0.9, "source_quote": "3–20 Nov 2026" },
    "end_date":    { "value": "2026-11-20", "confidence": 0.9, "source_quote": "3–20 Nov 2026" }
  },
  "missing_fields": ["offset_m", "diameter_m"],
  "geocode": { "status": "RESOLVED" | "PARTIAL" | "FAILED", "path": [[180, 206], [420, 206]], "notes": ["offset_m missing → using street side edge (3 m from kerb)"] },
  "preview_clash_count": 3
}
```
Errors: `400 EMPTY_INPUT`, `413 FILE_TOO_LARGE`, `422 PDF_NO_TEXT`.

### `PATCH /api/permits/{draft_id}`
User edits before commit. Body: `{ "fields": { "<field>": <new value> } }` (values only; confidence becomes 1.0, quote becomes `"edited by reviewer"`). Response: same shape as parse (re-geocoded, re-previewed).

### `POST /api/permits/{draft_id}/commit`
Body: `{ "reviewer": "A. Sharma" }`
Response:
```json
{ "work": { /* Work, origin: "INTAKE" */ }, "new_clash_ids": ["CLH-0031","CLH-0032","CLH-0033"], "audit": { /* AuditEntry */ } }
```
The work is added to the **plan** for analysis. This is NOT a permit approval — UI copy must say "Add to coordination plan".

### `GET /api/permits/samples`
`{ "items": [ { "id": "sample-1", "title": "Discom 11kV trench — Station Road", "text": "..." } ] }` — the 3 demo permits (also available as PDFs).

---

## Summary, audit, report, admin

### `GET /api/summary`
```json
{
  "counts": { "open": 14, "critical": 3, "high": 4, "needs_data": 2, "dig_once": 1, "schedule_overlap": 1 },
  "by_utility": [ { "utility": "GAS", "count": 3 } ],
  "by_certainty": [ { "certainty": "LIKELY", "count": 8 } ],
  "evaluation": {
    "ours":     { "true_positives": 5, "false_alarms": 0, "misses": 0, "precision": 1.0,  "recall": 1.0 },
    "baseline": { "true_positives": 2, "false_alarms": 1, "misses": 3, "precision": 0.67, "recall": 0.4 },
    "cases": [ { "case_id": "T4", "description": "Trench over deep sewer", "expected": "NO_CLASH", "ours": "NO_CLASH", "baseline": "FLAGGED" } ]
  }
}
```

### `GET /api/audit`
`{ "items": [ { "id": "AUD-0007", "at": "2026-10-16T14:02:11+05:30", "actor": "A. Sharma", "action": "ESCALATE", "target_id": "CLH-0004", "detail": "Gas main — needs GAIL-style standby" } ], "total": n }` newest first.

### `GET /api/report?format=html|csv`
`html` → `text/html` printable report (SPEC §11). `csv` → `text/csv` attachment `subterra-clash-report.csv`.

### `POST /api/reset`
Restores seed state (clears intake works, review decisions; keeps an audit entry "RESET"). Used before each demo run. Response `{ "status": "reset" }`.

---

## Mock files (frontend Phase 1)
| Mock | Mirrors |
|---|---|
| `shared/mocks/scene.json` | `GET /api/scene` |
| `shared/mocks/clashes.json` | `GET /api/clashes` |
| `shared/mocks/groups.json` | `GET /api/groups` |
| `shared/mocks/summary.json` | `GET /api/summary` |
| `shared/mocks/permit_parse.json` | `POST /api/permits/parse` |

`scene.json`, `clashes.json` and `groups.json` are generated from the real seed (`uv run python scripts/export_mocks.py`) and a test fails if they go stale. `summary.json` and `permit_parse.json` are hand-maintained until 3A / 2B. Frontend code should still not hard-code counts or IDs.