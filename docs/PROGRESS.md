# Subterra Clash — Progress

> Live checklist and the memory between agent sessions. Update it in the same commit as the work, **before** clearing the session.
> Format: `- [x] 1B — geometry + tests — Sam — short note`. Add blockers under "Blockers" immediately.
> Session details are in `docs/PHASES.md`.

**Current phase:** 1 — Core
**Kickoff (H0):** 16 Oct 2026, 01:00 IST
**Last gate passed:** Gate 0
**Pending for frontend:** run pnpm gen:api (fields with defaults are now required)

---

## Phase 0 — Setup
- [x] 0B — backend scaffold, /api/health, Python 3.14 wheels confirmed (or pinned 3.13) — Sam — py3.14.4, all deps resolve; no 3.13 pin needed; root `nvmrc` renamed to `.nvmrc`
- [x] 0F — Vite + Tailwind + shadcn + libs + proxy + mocks mode; uv installed on Windows — Friend
- [x] **Gate 0 passed**

## Phase 1 — Core
- [x] 1A — models + rules + gazetteer + seed generator with T1–T9 — Sam — 72 assets, 11 works (WRK-001..011); planted assets dedicated + exact SPEC values, tests assert them; rules `applies_to` = `{work_types, utility[], work_utility[]}` (empty = any), contract updated; Evidence.type values: ASSET_RECORD, PERMIT, RULE, PRECISION; HDD depth_from/to = bore top/bottom, PIPE_LAY depth_to = centre depth + d/2
- [x] 1B — geometry + tests — Sam — `app/engine/geometry.py`: segment/polyline 3D distance, pipe_gap, depth_at, footprints, excavation_gap, work_asset_gap, work_work_distance_2d; GapResult(gap, location). h≤0 uses shallowest depth inside footprint; asset wholly above an excavation band (depth_from>0) is vertically separated. Seed T1–T5 gaps verified (−0.6, 0.18, 1.045, 2.4, 0.2). 1C: ignore `depth_known` here, evaluate 0.5–3.0 m band by substituting depth
- [x] 1C — detect / certainty / schedule / severity / grouping / baseline + planted-case tests — Sam — `engine/analyze.py::analyze(scene, rules, today, previous_ids, work_uncertainty_m) -> AnalysisResult(clashes, groups, baseline_pairs, key_to_id, id_to_key)`; seed gives 13 clashes / 8 groups, T1–T9 pass, ours 5/0/0 vs baseline 2/1/3 (P 0.67, R 0.40), `baseline.evaluate()` ready for 3A. Stable keys: spatial `(kind, work_id, asset_id)`, schedule `(kind, min_work, max_work)`; ids never reused. SCHEDULE_OVERLAP certainty = LIKELY; NEEDS_DATA fires when worst-depth gap < required + horiz_precision. Deferred to 2B: INTAKE work uncertainty (param exists, default 0) and missing work depth → 0.5–3.0 m band
- [x] 1D — store + routes + OpenAPI exported — Sam — `app/store.py` (`Store`, `get_store()`; reviews keyed by stable clash key, `reanalyze()` keeps ids, `reset()` logs RESET audit entry in memory; `GET /api/audit` still 2C). Routes `/api/scene|rules|clashes|clashes/{id}|groups|reset` in `app/api/`; errors are top-level `{detail, code}` via `AppError`. `ClashDetail.rule` is null for SCHEDULE_OVERLAP. `scripts/export_openapi.py` → `shared/openapi.json`; `scripts/export_mocks.py` → scene/clashes/groups mocks from the real API (tests fail if stale)
- [x] 1E — API client + hooks + mocks mode + coords/colors + store + shell + routes — Friend — hand-written SPEC §7 types until gen:api; groups/clash-detail derived from mocks (rule null in mock mode); needs Node 24 (fnm use 24)
- [x] 1F — 3D scene (ground, pipes, works, markers, halos) + left rail — Friend — scene lazy-loaded (three.js chunk ~970 kB, main 354 kB); pipes/halos/works merged per utility; markers filtered by certainty only (layers never hide clashes); depth_known=false assets drawn faded at placeholder z; HDD/PIPE_LAY built from SPEC §8.1/§8.2 but only checked on a synthetic scene, verify against the real seed at Gate 1
- [ ] **Gate 1 passed**

## Phase 2 — Features
- [x] 2A — PDF text + sample permits + LLM extraction + cached fixtures — Sam — `app/permits/`: `extract_permit(text, settings=None, client=None) -> ExtractionResult(fields{15}, missing_fields, llm_mode_used)`; order live (LLM_MODE=live + key, 10 s) → fixture (exact sample text) → `rules_extract.extract_with_rules` (offline, conf 0.5, exact quotes); `llm_mode_used` ∈ live|cached|rules (contract updated); only empty text raises `ExtractionUnavailable`. `pdf_text.extract_pdf_text` raises `PdfNoTextError` (→422 PDF_NO_TEXT) / `PdfTooLargeError` (→413 FILE_TOO_LARGE). `sample_permits.SAMPLE_PERMITS` (sample-1..3; PDFs via `scripts/make_sample_permits.py`) is the source for 2B `/samples`. Fixtures hand-written (no API key). Rules set depth_from=0.0 for open-cut when only a depth is stated (as in the mock); HDD leaves it missing. No routes/models/OpenAPI changed. 2B: geocode `street/from_ref/to_ref/side/offset_m` (IDs ST-/JN-/LM-), `side` ∈ NORTH|SOUTH|EAST|WEST
- [ ] 2B — geocoder + permit routes + missing-data handling — Sam
- [ ] 2C — review + audit routes, OpenAPI re-exported — Sam
- [ ] 2D — clash panel + fly-to + conflict list — Friend
- [ ] 2E — section plane + cross-section SVG — Friend
- [ ] 2F — permit intake page — Friend
- [ ] **Gate 2 passed**

## Phase 3 — Depth
- [ ] 3A — summary + evaluation + explanation templates — Sam
- [ ] 3B — HTML + CSV report, edge cases, performance — Sam
- [ ] 3C — review queue table + export — Friend
- [ ] 3D — dashboard + schedule strip — Friend
- [ ] 3E — landing hero + transitions + toasts + loading/error states — Friend
- [ ] **Gate 3 passed**

## Phase 4 — Ship
- [ ] 4A — backend Dockerfile + compose + README verified + seed tuning — Sam
- [ ] 4B — frontend Dockerfile + polish + resolutions + backup video — Friend
- [ ] Rehearsed twice
- [ ] **Submitted**

---

## Blockers
- frontend: switch to generated schema.d.ts types at Gate 1 (`ClashDetail.rule` is nullable: null for SCHEDULE_OVERLAP clashes)
- frontend: `Summary` in `src/api/types.ts` is still hand-written; alias it to the generated type after backend 3A adds `/api/summary` to openapi.json — Friend

## Notes for 2B / 2C
- Permit commit: add the work to `store.scene.works`, call `store.reanalyze()` (ids stay stable), log audit via `store.log_audit`. Reviews: `store.set_review(clash_id, Review)` then audit; the review model/route is 2C.
- `work_uncertainty_m` and missing work depth band are still deferred to 2B (see 1C note).
- Re-run `uv run python scripts/export_openapi.py` and `scripts/export_mocks.py` whenever a response model or seed changes (`test_openapi_export.py` / `test_mocks.py` fail when stale).

## Decisions log
- Python 3.14 (fallback 3.13 if wheels missing).
- One repo, everyone commits to `main`, no branches. Sam owns `backend/`, `docs/`, `shared/`, root config; Friend owns `frontend/` (and may tick boxes in this file).
- AGENTS.md is the shared rules file (Claude Code reads it via `@AGENTS.md` in CLAUDE.md; Antigravity reads it natively).
- One agent session per session ID; plan → approve → build → checks → update this file → commit → clear.
- No AI attribution in commits or PRs: `.claude/settings.json` hides Claude Code's trailer, AGENTS.md forbids it, `.githooks/commit-msg` strips it. Each clone runs `git config core.hooksPath .githooks` once.