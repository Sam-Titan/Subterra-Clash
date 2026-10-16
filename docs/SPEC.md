# Subterra Clash — Product Spec

> Code-E-Manipal 2.0 · PS 32 / 35 · Track 08 Smart City & Infrastructure
> Team: Sam (backend) + frontend teammate · 24-hour build
> This file is the single source of truth for WHAT we build. If code and this spec disagree, the spec wins until Sam changes it.

---

## 1. One-line pitch

**Subterra Clash shows city engineers what is under the road before anyone digs — in 3D — and flags every probable clash between planned works and existing utilities, with the evidence, the uncertainty, and a review queue. It never approves or rejects a permit by itself.**

## 2. The problem (from the brief)

Water, sewer, power, telecom and planned construction share underground corridors. Permit records use different coordinate precision, clearance rules and planned dates, so conflicts are hard to spot before excavation. The tool must:

- Represent utility corridors and proposed works as 2D/3D geometries with **depth, clearance, uncertainty and schedule**.
- Detect **geometric intersections and near-conflicts**, accounting for declared tolerance and **missing metadata**.
- **Group related clashes** and propose a **review order**, without automatically approving or rejecting any permit.

Required deliverables (judges will check these):
1. A small **map / cross-section viewer** with synthetic utility layers and proposed work corridors.
2. A **conflict list** with location, affected assets, clearance measurement and source record.
3. A **severity-ranked review queue** and an **exportable inspection report**.

## 3. What makes ours stand out

| Differentiator | Why judges care |
|---|---|
| **3D "X-ray street" view** with pipes at true depth, pulsing clash markers, and **uncertainty halos** around low-precision assets | Nobody else will have a 3D underground viewer; uncertainty becomes visible, not a footnote |
| **Street-level view + X-ray reveal**: the camera drops to eye height on a street; toggling X-ray fades the road and reveals pipes, works and clash markers underfoot | Instantly shows the problem to non-technical viewers |
| **Permit intake with LLM extraction**: upload a messy permit PDF/text → structured fields with confidence + the exact source quote → placed in the scene → new clashes animate in | Uses our NLP strength; matches real-world reality (permits are documents, not GeoJSON) |
| **Three honest certainty classes**: LIKELY / POSSIBLE / NEEDS_DATA | Directly answers "leave ambiguous cases for engineering review" |
| **Dig-once opportunities**: two works in the same corridor within 90 days → suggest coordinating | Positive utility, ties to India's "dig once" policy push |
| **Baseline comparison**: naive 2D overlay vs our depth + tolerance + uncertainty engine, scored on planted ground truth | Every PS in this hackathon rewards a baseline; ours shows measurable false-alarm reduction and caught misses |

## 4. Users

- **Municipal / utility coordination engineer** (primary): reviews new permits, decides what needs field verification.
- **Utility department reviewer** (water board, discom, telecom, gas): sees clashes touching their assets.
- **Judges at the demo**: must understand it in 30 seconds.

## 5. Scope

### In scope (must ship)
- Synthetic fictional area: **"Navgarh — Sector 7"**, a ~600 m × 400 m street grid.
- 5 utility types, ~60–120 asset segments, 8–12 proposed works, seeded deterministically.
- Clash engine (spatial + schedule + dig-once) with certainty classes and severity.
- Grouping + severity-ranked review queue + review actions with audit log.
- Permit intake (PDF or pasted text) → LLM extraction → gazetteer geocoding → commit → re-analysis.
- Street-level mode in the 3D scene (eye-height camera on a street, X-ray reveal of what is underfoot).
- 3D scene, cross-section view, clash detail panel, review queue table, dashboard, schedule strip.
- Inspection report export (HTML, print-to-PDF) + CSV.
- Baseline comparison against planted ground truth.

### Out of scope (do NOT build)
- Real city data, real utility records, real coordinates, live feeds.
- Auth / user accounts (a reviewer name text field is enough).
- Automatic permit approval or rejection — **forbidden by the brief**.
- Mobile layout perfection (desktop demo; just don't break on a laptop screen).
- A real map basemap (optional stretch only — see §12).

## 6. Coordinate system & units

- Local metric frame. **x = east (m), y = north (m), z = elevation relative to road surface (m), so underground is negative** (a pipe at 1.2 m depth has z = −1.2).
- Origin (0,0) = south-west corner of Sector 7.
- All distances in **metres**, diameters in **metres** in the API (permits may say mm; convert on ingest).
- Dates are ISO `YYYY-MM-DD`. Timestamps ISO 8601 with timezone.
- The frontend uses these coordinates directly in Three.js (map x→X, y→−Z, z→Y). Document this in one helper (`frontend/src/lib/coords.ts`).

## 7. Data model

IDs are prefixed strings: `AST-` assets, `WRK-` works, `CLH-` clashes, `GRP-` groups, `PRM-` permit drafts, `AUD-` audit entries, `ST-` streets, `JN-` junctions.

### 7.1 Gazetteer (fixed synthetic geography)
- **Street**: `id, name, centerline: [[x,y],…], width_m`
  Names are Indian-flavoured but fictional: "Vikas Marg", "Station Road", "Gulmohar Lane", "Nehru Path", "Lake View Road", "Sector Main Road".
- **Junction**: `id, name, x, y` (e.g. "J3 — Vikas Marg × Station Road").
- **Landmark**: `id, name, x, y` (e.g. "Govt. School", "Water Tank", "Bus Depot").

### 7.2 Utility asset (existing, underground)
| Field | Type | Notes |
|---|---|---|
| `id` | str | `AST-0042` |
| `utility` | enum | `WATER`, `SEWER`, `POWER`, `TELECOM`, `GAS` |
| `owner` | str | Fictional dept, e.g. "Navgarh Jal Board", "NVVN Discom", "Navgarh Gas Ltd" |
| `label` | str | e.g. "300 mm DI water main", "11 kV XLPE cable" |
| `path` | `[[x,y,z],…]` | centreline polyline; z may vary per vertex |
| `diameter_m` | float | outer diameter (ducts/cables: duct/bundle diameter) |
| `horiz_precision_m` | float | ± horizontal position uncertainty from the source record (0.1 = surveyed, 2.0 = digitised from old paper map) |
| `depth_precision_m` | float \| null | ± depth uncertainty; null when depth is unknown |
| `depth_known` | bool | false → z values are placeholders and must not be trusted |
| `source_record` | `{record_id, source, captured_on, method}` | method: `SURVEYED`, `AS_BUILT`, `DIGITISED`, `ESTIMATED` |

### 7.3 Proposed work
| Field | Type | Notes |
|---|---|---|
| `id` | str | `WRK-007` |
| `title` | str | "Fibre ducting, Station Road (north side)" |
| `agency` | str | Fictional agency |
| `work_type` | enum | `TRENCH` (open cut), `PIT` (excavation box), `HDD` (horizontal directional drill bore), `PIPE_LAY` (new pipe in trench) |
| `utility` | enum \| null | utility being installed, if any |
| `path` | `[[x,y],…]` | 2D corridor centreline (for PIT: polygon ring) |
| `width_m` | float | trench/pit width |
| `depth_from_m` / `depth_to_m` | float | excavation depth band (positive numbers, depth below surface) |
| `bore_path` | `[[x,y,z],…]` \| null | HDD only: 3D bore centreline |
| `bore_diameter_m` | float \| null | HDD / PIPE_LAY |
| `start_date` / `end_date` | date | |
| `source_permit` | `{permit_no, source, submitted_on}` | |
| `origin` | enum | `SEED` or `INTAKE` (came through permit intake) |
| `field_confidence` | map field → 0–1 | only for `INTAKE` works |
| `missing_fields` | str[] | fields that were absent in the permit |

### 7.4 Clearance rules (declared for this exercise)
Stored in `backend/app/data/rules.json`, served at `GET /api/rules`. **Illustrative values for the hackathon, not a regulatory standard — the UI says so.**

| Rule id | Pair | Min clearance (surface to surface) |
|---|---|---|
| `R-EXC-GAS` | Excavation (TRENCH / PIT / HDD) vs GAS | 1.0 m (hand-dig zone) |
| `R-EXC-POWER` | Excavation vs POWER | 0.6 m |
| `R-EXC-OTHER` | Excavation vs WATER / SEWER / TELECOM | 0.3 m |
| `R-WATER-SEWER` | New WATER pipe (PIPE_LAY) vs existing SEWER | 0.5 m |
| `R-PIPE-GAS` | New pipe (PIPE_LAY) vs GAS | 0.5 m |
| `R-DEFAULT` | Any other pair (e.g. PIPE_LAY vs WATER / TELECOM / POWER) | 0.3 m |

"Excavation" means `TRENCH`, `PIT` and `HDD`. `PIPE_LAY` is checked as a pipe (3D distance) using the last three rules. Pick the first matching rule from top to bottom.

### 7.5 Clash
| Field | Type | Notes |
|---|---|---|
| `id` | str | `CLH-0019` |
| `kind` | enum | `INTERSECTION` (gap ≤ 0), `CLEARANCE` (0 < gap < required), `SCHEDULE_OVERLAP`, `DIG_ONCE` |
| `certainty` | enum | `LIKELY`, `POSSIBLE`, `NEEDS_DATA` (see §8.3). `DIG_ONCE` is always `LIKELY`. |
| `severity` | `{score 0–100, band, factors}` | band: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO` |
| `work_ids` | str[] | 1 work (spatial) or 2 works (schedule/dig-once) |
| `asset_ids` | str[] | affected assets (empty for schedule/dig-once) |
| `location` | `{x,y,z}` | closest-approach point (marker position) |
| `measured_gap_m` | float \| null | surface-to-surface gap; negative = overlap depth |
| `required_clearance_m` | float \| null | from the rule |
| `uncertainty_m` | float \| null | combined uncertainty used |
| `rule_id` | str \| null | which rule fired |
| `schedule` | `{overlap_days, gap_days}` \| null | schedule/dig-once only |
| `explanation` | str | one plain-English sentence generated from the numbers (deterministic template, not LLM) |
| `evidence` | `[{type, ref, detail}]` | source records, permit numbers, rule, precision values |
| `missing_data` | str[] | e.g. `["AST-0031.depth"]` |
| `group_id` | str | |
| `review` | `{status, reviewer, note, updated_at}` | status: `OPEN`, `ACKNOWLEDGED`, `ESCALATED`, `DISMISSED` |
| `baseline_flagged` | bool | did the naive 2D baseline flag this pair? |

### 7.6 Clash group
`id, clash_ids[], work_ids[], max_severity_score, review_rank, title` — related clashes = sharing a work, or within 15 m of each other along the same street. `review_rank` 1 = review first; groups containing only INFO clashes (dig-once opportunities) rank after every group with a conflict.

### 7.7 Audit entry
`id, at, actor, action, target_id, detail` — every review action, permit commit and reset is logged. Append-only.

## 8. Clash engine rules

### 8.1 Candidate pairs
- Build a Shapely `STRtree` over 2D footprints. Assets: centreline buffered by `diameter/2 + horiz_precision + 1.5 m`. Works: TRENCH = `path` buffered by `width/2`; PIT = the `path` polygon itself; HDD = 2D projection of `bore_path` buffered by `bore_diameter/2`; PIPE_LAY = `path` buffered by `bore_diameter/2`. Each candidate search also adds 1.5 m so near-misses are found.
- Pairs: every work × nearby asset; every work × nearby work.

### 8.2 Gap computation (2.5D)
- **Pipe/bore vs pipe** (HDD, PIPE_LAY vs asset): 3D minimum distance between polyline segments (NumPy segment–segment distance) minus both radii. PIPE_LAY has no `bore_path`, so its 3D centreline is `path` at depth `depth_to_m − bore_diameter/2`.
- **Excavation vs pipe** (TRENCH, PIT vs asset):
  - `h` = 2D distance between work footprint polygon and asset centreline − asset radius (Shapely).
  - Asset depth at the closest point = interpolated |z|; asset top = depth − radius.
  - If `h ≤ 0` (asset passes under/through the footprint): `gap = asset_top_depth − depth_to_m` (positive = asset is safely below the trench floor).
  - Else if the asset's depth band overlaps the excavation band: `gap = h`.
  - Else: `gap = sqrt(h² + v²)` where `v` = vertical separation between bands.
- Keep geometry functions pure and unit-tested with hand-computed cases.

### 8.3 Certainty classification
`u = sqrt(horiz_precision² + depth_precision²)` of the asset (+ the work's own uncertainty for INTAKE works with low-confidence location fields).

| Condition | Result |
|---|---|
| asset `depth_known = false` and a violation would happen for at least one depth in the plausible band 0.5–3.0 m | `NEEDS_DATA` |
| `gap < required − u` | `LIKELY` (violation even in the best case) |
| `required − u ≤ gap < required + u` | `POSSIBLE` (depends on where the asset really is) |
| `gap ≥ required + u` | no clash |

- `kind` = `INTERSECTION` if `gap ≤ 0`, else `CLEARANCE`.
- For `NEEDS_DATA`: `measured_gap_m = null`, `uncertainty_m = null`, `kind = CLEARANCE`, and `missing_data` names the missing field (e.g. `AST-0005.depth`). Never invent a gap.
- If `depth_known = false` and no depth in 0.5–3.0 m could violate the rule, there is no clash.
- An asset with `depth_known = true` always has a `depth_precision_m`; if the seed or a permit lacks it, treat the asset as `depth_known = false`.

### 8.4 Schedule rules
- Two works whose footprints are within 5 m of each other:
  - date ranges overlap → `SCHEDULE_OVERLAP` (`overlap_days`).
  - no overlap but gap ≤ 90 days → `DIG_ONCE` opportunity ("coordinate to dig once", `gap_days`).

### 8.5 Severity (explainable)
```
score = 100 × (0.40·hazard + 0.30·breach + 0.15·urgency + 0.15·confidence)
hazard     GAS 1.0 · POWER 0.9 · WATER 0.6 · SEWER 0.55 · TELECOM 0.35 · (schedule clash 0.5)
breach     clamp((required − gap) / required, 0, 1)   (schedule and NEEDS_DATA: 0.5)
urgency    work starts ≤14 days → 1.0 · ≤60 days → 0.5 · later → 0.2   (relative to "today" = demo date in config)
confidence LIKELY 1.0 · POSSIBLE 0.6 · NEEDS_DATA 0.4
bands      ≥75 CRITICAL · ≥55 HIGH · ≥35 MEDIUM · else LOW · DIG_ONCE always INFO
```
`factors` returns each term so the UI can show the breakdown bar. Round the score half-up to an integer.

### 8.6 Baseline (for comparison)
Naive 2D GIS overlay: flag a work/asset pair iff the work footprint polygon intersects the asset's 2D centreline. No depth, no clearance, no uncertainty, no schedule.

### 8.7 Ground truth & evaluation
`backend/app/data/seed/truth.json` lists the planted cases as `{case_id, description, work_id, asset_id | other_work_id, expected}`.

Planted cases the seed generator MUST include. The numbers are chosen so the expected outcome follows from §8.2–8.4; keep them exact.

| # | Setup (exact values) | Expected (ours) | Baseline |
|---|---|---|---|
| T1 | TRENCH 0–1.5 m deep crosses a 0.2 m GAS main at 1.0 m depth, precision ±0.2 / ±0.2 (SURVEYED) | INTERSECTION · LIKELY (gap −0.6, needs 1.0) · CRITICAL | flags ✔ |
| T2 | HDD bore (0.2 m) runs **alongside** a 0.15 m POWER cable at the same depth, 0.18 m surface gap, never crossing in plan; cable ±0.2 / ±0.2 | CLEARANCE · LIKELY (0.18 < 0.6 − 0.28) | misses ✘ |
| T3 | PIPE_LAY WATER (0.2 m) runs parallel to a 0.11 m TELECOM duct, centres 1.2 m apart in plan, same depth; duct ±2.0 / ±0.5 (DIGITISED) | CLEARANCE · POSSIBLE (gap ≈1.05, band 0.3 ± 2.06) | misses ✘ |
| T4 | TRENCH 0–1.5 m crosses a 0.6 m SEWER at 4.2 m depth, ±0.25 / ±0.3 | no clash (gap 2.4) | false alarm ✘ |
| T5 | PIPE_LAY WATER (0.2 m) laid parallel to an existing 0.3 m WATER main, 0.2 m surface gap, same depth, never crossing in plan; main ±0.05 / ±0.05 (SURVEYED) | CLEARANCE · LIKELY (0.2 < 0.3 − 0.07) | misses ✘ |
| T6 | PIT 0–2.0 m over a POWER cable with `depth_known = false` | NEEDS_DATA | flags ✔ (but cannot say why) |
| T7 | Two works within 5 m on Station Road with overlapping dates | SCHEDULE_OVERLAP | — |
| T8 | Two works within 5 m on Vikas Marg, 45 days apart | DIG_ONCE · INFO | — |
| T9 | A TRENCH far from every asset and work | nothing | nothing |

**Evaluation rules** (`GET /api/summary` → `evaluation`):
- Precision and recall cover the spatial cases only: positives = T1, T2, T3, T5, T6 (5); negatives = T4, T9 (2). A positive counts as found if the pair is flagged with any certainty.
- With the setup above the expected result is: ours 5 found, 0 false alarms, 0 misses (precision 1.0, recall 1.0); baseline 2 found (T1, T6), 1 false alarm (T4), 3 misses (T2, T3, T5) → precision 0.67, recall 0.40. `tests/test_planted_cases.py` asserts these numbers.
- T7 and T8 are reported as pass/fail rows in `cases`, outside precision/recall.
- Only pairs listed in `truth.json` are scored. Other clashes in the seed (planted works will also touch other assets on the same street) are fine and are not counted.

## 9. Permit intake (LLM + deterministic geocoding)

1. **Input**: PDF upload (PyMuPDF text extraction) or pasted text. Hinglish/messy wording allowed.
   Example: *"NVVN Discom — permit 2026/STN/114. Lay 11kV cable by open trench along north side of Station Road from J3 to Bus Depot, approx 1.2 m deep, 0.6 m wide. Work 3–20 Nov 2026."*
2. **LLM extraction** (structured output / tool call) → fields: `agency, permit_no, work_type, utility, street, from_ref, to_ref, side, offset_m, depth_from_m, depth_to_m, width_m, diameter_m, start_date, end_date`. For each field: `value, confidence 0–1, source_quote` (exact span from the text) or `null` + listed in `missing_fields`.
3. **The LLM never invents geometry.** A deterministic geocoder resolves `street + from_ref + to_ref + side + offset` against the gazetteer into a 2D path. Unresolvable refs → field flagged, user picks from a dropdown.
4. **Missing values are never silently defaulted.** Missing depth → excavation band treated as 0.5–3.0 m and resulting clashes become `NEEDS_DATA`/`POSSIBLE`.
5. User reviews the draft (can edit any field), then **commits** → work added (`origin = INTAKE`) → engine re-runs → response lists the new clashes.
6. **Demo safety**: the 3 demo permits have cached LLM responses in `backend/app/permits/fixtures/`. If `LLM_MODE=cached` or the API call fails, the cache is used. The demo must work offline.

## 10. Screens (frontend)

Visual direction: dark, technical, "engineering x-ray". Utility colours follow the APWA uniform colour code so engineers recognise them instantly:
**POWER red `#E5484D` · GAS yellow `#F5D90A` · TELECOM orange `#F76B15` · WATER blue `#0090FF` · SEWER green `#30A46C` · proposed works / excavation magenta-pink `#D6409F` (APWA pink = temporary survey marking)**.
Certainty colours on markers: LIKELY solid + pulse, POSSIBLE dashed ring, NEEDS_DATA grey with "?" glyph.

1. **Landing** — one hero moment (Aceternity spotlight or similar): title, one-line pitch, "Enter Sector 7" button, three live stat counters.
2. **Workspace** (main screen):
   - **Left rail**: layer toggles per utility + works, certainty filter, "X-ray" toggle (ground opacity), "show uncertainty halos" toggle.
   - **Centre — 3D scene (React Three Fiber)**: translucent ground with street outlines and labels, pipes as tubes at true depth, works as translucent pink volumes (trench boxes, HDD tubes), clash markers at `location`, uncertainty halos = faint wider tubes of radius `diameter/2 + horiz_precision`. Orbit controls; "fly to" on clash select.
     - **City context + street-level view** (frontend only, built in 3E): low-poly city generated on the frontend from `/api/scene` streets (road surface, kerbs, footpaths, lane markings, extruded building blocks in the gaps between streets, a few lamp posts and trees; landmarks as simple distinct shapes from `/api/scene` `landmarks`). Deterministic seeded layout, no CDN textures, no external models. A **"Street level"** button and an **"Overview"** button animate the camera between an eye-height view (~1.7 m) on a chosen street and the orbit view. X-ray fades road and buildings to low opacity so pipes, works and clash markers show through. Must keep 60 fps on a laptop; use instanced meshes for repeated geometry. No API changes.
   - **Section plane**: draggable plane across a street → bottom panel shows a **2D cross-section (SVG)** with pipe circles at depth, trench outline, and dimension lines labelled with measured vs required clearance.
   - **Right panel — clash detail**: kind + certainty badges, severity score with factor breakdown bar, measured vs required vs uncertainty, affected assets with source records and capture method, missing data list, explanation sentence, review actions (Acknowledge / Escalate / Dismiss-with-note).
   - **Bottom strip — schedule**: mini Gantt of works; schedule overlaps and dig-once links highlighted; date scrubber filters the scene.
3. **Review queue** — shadcn data table grouped by clash group, sorted by `review_rank`; columns: rank, severity, kind, certainty, assets, work, gap/required, status. Bulk export. "Export inspection report" button.
4. **Permit intake** — drop zone / paste box → fields fill in one by one with confidence chips and highlighted source quotes → map preview of the resolved path → "Commit to plan" → jump to workspace where new clashes animate in.
5. **Dashboard** — number tickers (open clashes, critical, needs-data, dig-once savings), clashes by utility and by certainty (shadcn charts), **ours vs baseline** table (false alarms, misses, precision, recall).

## 11. Inspection report

`GET /api/report?format=html` → printable HTML (browser "Save as PDF"): header with area + generation time + disclaimer, summary counts, ours-vs-baseline table, then clashes in review order with location, assets, source records, measured/required/uncertainty, certainty, review status and reviewer note. `format=csv` → flat table.

Disclaimer text (exact): *"Decision-support output from synthetic data. Clearance values are illustrative. No permit has been approved or rejected by this tool; all findings require engineering review and field verification."*

## 12. Stretch goals (only after Phase 3 gate passes)
1. MapLibre + deck.gl 2D overview tab (synthetic area placed at a fictional anchor).
2. Sewer-below-water crossing order rule.
3. "What-if" slider: move a proposed trench sideways and watch clashes update live.
4. Voice/Hinglish permit dictation.

## 13. Non-negotiables (judging traps)
- No auto-approve/reject anywhere — not in UI copy, not in API.
- Every clash shows its source record and the rule used.
- Uncertainty and missing data are visible, never hidden.
- Baseline comparison exists and is shown on the dashboard and in the report.
- The demo runs without internet (cached LLM fixtures, local assets, no CDN-only fonts).