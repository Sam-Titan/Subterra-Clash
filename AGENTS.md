# AGENTS.md — Subterra Clash

Shared rules for every coding agent on this repo. Both team members use Claude Code (it reads this file through `CLAUDE.md`), and each machine's gitignored `CLAUDE.local.md` says who the agent works for. Keep this file under 12,000 characters.

## What we are building
A 3D review tool that finds probable spatial and schedule conflicts between proposed underground works and existing utilities, shows the evidence and uncertainty, and ranks them for engineering review. Hackathon: Code-E-Manipal 2.0, PS 32. 24-hour build.

**Read before any task:**
1. `docs/PROGRESS.md` — current phase, what is done, blockers.
2. `docs/PHASES.md` — the tasks for the current phase.
3. `docs/SPEC.md` — the product, data model and engine rules.
4. `docs/API_CONTRACT.md` — every endpoint and payload.
5. `docs/PHASE4_PLAN.md` — Phase 4 sessions 4A–4E (Sam, full stack).

Work happens in numbered sessions (e.g. `1B`, `2E`) listed in `docs/PHASES.md`. Build only the session you were given: plan first, wait for approval, then build. If a task is unclear or the spec seems wrong, stop and ask instead of guessing. Before finishing, run the checks below and update `docs/PROGRESS.md` — the next session starts with no memory except that file.

## Team and folder ownership (strict)
> **Ownership of the project stays shared between Sam and Rishit, but from Phase 4 Sam alone makes the changes** (backend and frontend). The table below is historical. Sessions 4A–4E live in `docs/PHASE4_PLAN.md`.

| Who | Tool | Owns (may edit) |
|---|---|---|
| Sam | Claude Code (WSL2) | `backend/`, `docs/`, `shared/`, root config files |
| Rishit | Claude Code (Windows) | `frontend/` |

- Never edit files outside the folders owned by the person you are working for. If a change is needed elsewhere, say so in your reply and stop.
- The frontend agent never edits `docs/API_CONTRACT.md`, `shared/openapi.json` or `shared/mocks/`. Ask Sam.
- `frontend/src/api/schema.d.ts` is generated. Never hand-edit it.
- Backend sessions (Sam): 0B, 1A, 1B, 1C, 1D, 2A, 2B, 2C, 3A, 3B, 4A. Frontend sessions (Rishit): 0F, 1E, 1F, 2D, 2E, 2F, 3C, 3D, 3E, 4B.

## Git workflow (everyone commits to `main`, no branches)
- `git pull --rebase` before starting work and before every push.
- **The agent runs git at the end of each session, with approval:** after the checks pass and PROGRESS.md is ticked, show the human the file list and the commit message and wait for "yes". Then: `git add` only files in your owner's folders plus `docs/PROGRESS.md` → `git commit` → `git pull --rebase` → `git push`.
  - A rebase conflict in `docs/PROGRESS.md` only: resolve it by keeping both sides' ticks and notes, then `git rebase --continue`.
  - Any other conflict, a rejected push, or a missing upstream: stop and show the human. Never force-push, never `git reset --hard`, never rewrite pushed history.
- Small commits after each working step. Message format: `backend: add segment distance + tests` or `frontend: clash panel review actions`.
- **No AI attribution, ever.** Commits and PR descriptions contain only the message. Never add `Co-authored-by` lines for any AI tool, "Generated with …" lines, session links, or tool names. The author is the human's own git identity. (`.githooks/commit-msg` strips such lines as a safety net; do not disable it.)
- Never commit code that fails its checks (see Commands). Never commit `.env`, secrets, `node_modules`, `.venv`, build output.
- Update `docs/PROGRESS.md` in the same commit as the work it records (frontend person: tick your boxes there; that is the one shared doc you may edit).

## Stack
- **Backend:** Python 3.14 (fallback 3.13), uv, FastAPI, Pydantic v2, Shapely 2, NumPy, NetworkX, PyMuPDF, Jinja2, Anthropic SDK (LLM provider via env). Ruff + pytest. In-memory store seeded from JSON.
- **Frontend:** Vite + React + TypeScript (strict), Tailwind v4, shadcn/ui, React Three Fiber + drei (3D), TanStack Query, TanStack Table, Zustand, React Router, Motion, lucide-react, Biome. Magic UI / Aceternity only for a few highlight moments.
- **Ports:** backend `8000`, frontend `5173`. Vite proxies `/api` → `http://localhost:8000`.
- No databases, no auth, no external map tiles, no CDN-only assets (demo must run offline).

## Commands
Backend (run inside `backend/`):
```
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run ruff check --fix . && uv run ruff format .
uv run pytest -q
uv run python -m app.data.generator        # rebuild seed JSON
uv run python scripts/export_openapi.py    # writes ../shared/openapi.json
```
Frontend (run inside `frontend/`):
```
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
pnpm gen:api        # regenerate src/api/schema.d.ts from ../shared/openapi.json
```
**Definition of done for any change:** backend → ruff clean + pytest green; frontend → typecheck + lint + build green, and you looked at it in the browser.

## Repository layout
```
backend/app/
  main.py  config.py  store.py
  models/        # Pydantic models = SPEC §7 (single source of field names)
  data/          # gazetteer.py, generator.py, rules.json, seed/{scene,truth}.json
  engine/        # geometry.py, detect.py, schedule.py, severity.py, grouping.py, baseline.py
  permits/       # pdf_text.py, extract.py (LLM), geocode.py, fixtures/, samples/
  report/        # html + csv export, templates/
  api/           # routes_*.py — thin, call engine/store only
backend/tests/   backend/scripts/
frontend/src/
  api/           # client.ts, hooks.ts, schema.d.ts (generated), mocks
  store/         # Zustand
  lib/           # coords.ts, colors.ts, format.ts
  components/ui/ # shadcn (generated by CLI)
  features/      # scene3d/, section/, clashes/, permits/, timeline/, dashboard/
  pages/         # Landing, Workspace, Queue, Intake, Dashboard
shared/          # openapi.json, mocks/*.json
docs/            # SPEC, PHASES, PROGRESS, API_CONTRACT, DEMO_SCRIPT
```

## Backend conventions
- Type hints everywhere; Pydantic models for every request/response; enums as `StrEnum` matching SPEC names exactly.
- Routes are thin. Logic lives in `engine/` and `permits/`. Engine functions are pure (data in, data out) and unit-tested.
- Geometry: write the pytest with a hand-computed expected value before the implementation. Units are metres; z is negative below ground.
- Deterministic: seed generator uses `random.Random(42)`; same input → same clash IDs and order.
- Explanations are generated from templates using the computed numbers. Do not use the LLM for explanations.
- LLM is used only in `permits/extract.py`. It returns value + confidence + exact source quote per field. It never produces coordinates. Respect `LLM_MODE=cached|live` and fall back to fixtures on any error or timeout (10 s).
- After changing any response model: export OpenAPI; Sam runs `pnpm gen:api` after any `shared/openapi.json` change, before frontend work that uses the new types. The agent runs it only when Sam asks.
- Errors: `HTTPException` with `{detail, code}` as in the contract.

## Frontend conventions
- TypeScript strict, no `any`. API types come from `src/api/schema.d.ts` (or mock-typed equivalents before Gate 1).
- All server data through TanStack Query hooks in `src/api/hooks.ts`. UI state (selection, toggles, filters) in Zustand. No prop-drilling across features.
- Use shadcn components from `@/components/ui`; install new ones with the shadcn CLI, do not write them by hand.
- Colours: only from `src/lib/colors.ts` (APWA utility palette in SPEC §10). Dark theme first.
- Coordinates: only convert through `src/lib/coords.ts` (SPEC §6).
- 3D: keep geometry memoised (`useMemo`), instance repeated meshes, no per-frame allocations in `useFrame`. Target 60 fps on a laptop.
- Every query has loading and error UI. No blank screens.
- Animation is purposeful: markers pulse, panels slide, numbers tick. Do not add effects that slow the 3D view.

## Domain rules (judging requirements — never violate)
1. The tool **never approves or rejects a permit.** No "Approve"/"Reject" buttons or copy. Committing a permit is "Add to coordination plan".
2. Every clash shows: location, affected assets, measured vs required clearance, uncertainty, source record, rule.
3. Three certainty classes only: `LIKELY`, `POSSIBLE`, `NEEDS_DATA`. Never hide uncertainty or missing data.
4. Missing values are never silently defaulted; they are listed in `missing_fields` / `missing_data`.
5. The naive 2D baseline comparison must stay working and visible.
6. All data is synthetic and fictional (Navgarh — Sector 7). Never add real addresses, real utility records or real people.
7. Clearance values are illustrative; keep the disclaimer from SPEC §11 in the UI and report.

## Do not
- Add new dependencies without saying why in the commit message.
- Rename API fields, enums or routes on your own.
- Refactor files outside the current task.
- Start stretch goals before Gate 3 passes.
- Leave TODOs without a matching line under "Blockers" in PROGRESS.md.