# Subterra Clash — Build Phases

> Read this with `docs/SPEC.md` (what) and `docs/PROGRESS.md` (where we are).
> Agents: build ONLY the session you were given, in YOUR folder. Do not start the next phase until its gate passes.
> Hours are from kickoff (H0).

## How the two of us work

- **Every phase has a backend half and a frontend half that run at the same time.** Sam's half is built with Claude Code (WSL2), Rishit's half with Claude Code (Windows). Phase 0 is done together.
- **Integration happens at the gate at the end of each phase** (H1.5, H7, H13, H19). Both stop, pull, run the full app together, fix mismatches; Sam ticks the gate in PROGRESS.md. About 20 minutes each (see "How to run a gate").
- **Each phase is split into sessions** (1A, 1B, …). One agent session = one session ID below:
  1. `git pull --rebase`, then start a fresh session (`/clear` in Claude Code).
  2. Paste the session prompt (below), filling in the phase, session ID and side.
  3. Review the plan, approve, let it build.
  4. It runs the checks (AGENTS.md "Definition of done") and ticks its own line in PROGRESS.md.
  5. It shows you the files and the commit message. You say yes; it commits, runs `git pull --rebase`, and pushes (it resolves PROGRESS.md-only conflicts itself and stops on anything else). Only then `/clear` and start the next session. PROGRESS.md is the memory between sessions, so it must be pushed before clearing.
- **One-time per machine:** local `main` must track `origin/main`. If `git pull` says "no tracking information", run `git push -u origin main` once (after `git pull --rebase origin main` if GitHub already has commits).
- **Both agents edit PROGRESS.md**, but each only ticks its own session lines, so pulls rarely conflict. If they do, keep both sides' ticks.

### Session prompt (same for both of us)
```
Read AGENTS.md, docs/PROGRESS.md and docs/PHASES.md. We are in Phase <N>. Do session <ID> only, for the <backend|frontend>. Confirm earlier sessions it depends on are ticked in PROGRESS.md. Plan first and wait for my approval before writing code. When done, run the definition-of-done checks, tick <ID> in docs/PROGRESS.md, then show me the files and a commit message with no AI attribution. After my yes, commit, git pull --rebase and push, following the git rules in AGENTS.md.
```
Example: `… We are in Phase 1. Do session 1B only, for the backend. …`

### How to run a gate (both of us, ~20 min)
A gate is a joint check, not a build session. Both run it, each for their own side, then one combined run on Sam's machine.

1. **Both:** finish your sessions for the phase, commit, push. Then `git pull --rebase` so both machines have everything.
2. **Both, in parallel:** start a fresh agent session and paste the gate prompt (below) for your side. The agent runs the checks and reports what fails; it does not build features. Each of you fixes failures only in your own folder, then commits and pushes.
3. **Together, on Sam's machine (WSL2):** pull, run the backend and the frontend with `VITE_USE_MOCKS=false`, and walk through that phase's gate line by hand in the browser.
4. **Rishit, once per gate:** also run both apps on Windows to confirm nothing is machine-specific.
5. **Sam:** if everything passes, tick the gate in PROGRESS.md, set "Current phase" to the next phase, update "Last gate passed", commit and push. If something fails, add it under "Blockers" and fix it before starting the next phase.

### Gate prompt (each runs it for their own side)
```
Read AGENTS.md, docs/PROGRESS.md and docs/PHASES.md. We are at Gate <N>. Do not start new features. For the <backend|frontend>, run the definition-of-done checks, confirm every session of Phase <N> on my side is ticked and actually works, check my side against docs/API_CONTRACT.md, and list anything that fails with the smallest fix in my own folder. Wait for my approval before changing code. If you fix anything, commit and push it the same way as a session (show me first).
```

## Before H0 — install these (both, ~30 min, do it the night before)

| | Sam (Windows + WSL2 Ubuntu; everything inside WSL) | Rishit (Windows) |
|---|---|---|
| Git | `sudo apt install git curl` | Git for Windows (includes Git Bash) |
| Git identity | `git config --global user.name "<GitHub username>"` and `user.email` = the email on your GitHub account | same, with their own account |
| GitHub access | SSH key or `gh auth login`; you are the repo owner | Accept the collaborator invite you send; SSH key or Git Credential Manager |
| Python tooling | uv (`curl -LsSf https://astral.sh/uv/install.sh \| sh`); uv downloads Python 3.14 itself | uv for Windows (see 0F); needed to run the backend at gates |
| Node | Node 24 LTS via nvm (`nvm install 24`), then `corepack enable`; needed to run the frontend at gates | Node 24 LTS installer, then `corepack enable` |
| Agent | Claude Code installed inside WSL, logged in | Claude Code installed on Windows, logged in |
| Docker (Phase 4 only) | Docker Desktop on Windows with WSL integration turned on for your distro | Docker Desktop (optional; only one of you needs it) |
| LLM key (optional) | Anthropic API key in `backend/.env` for live permit extraction; without it, `LLM_MODE=cached` still works | not needed |

No system Python, no Postgres, no global npm packages. Everything else is installed by `uv sync` and `pnpm install`.

| Phase | Hours | Backend sessions (Sam · Claude Code) | Frontend sessions (Rishit · Claude Code) | Gate (integration) |
|---|---|---|---|---|
| 0 Setup | H0–H1.5 | 0B | 0F | Both apps run; same tree on both machines |
| 1 Core | H1.5–H7 | 1A · 1B · 1C · 1D | 1E · 1F | 3D scene shows real clashes from the real API |
| 2 Features | H7–H13 | 2A · 2B · 2C | 2D · 2E · 2F | Paste a permit → commit → new clashes appear in 3D |
| 3 Depth | H13–H19 | 3A · 3B | 3C · 3D · 3E | Full demo runs end to end, report exports |
| 4 Ship | H19–H24 | 4A | 4B | Docker up, demo rehearsed twice, buffer left |

---

## Phase 0 — Setup (H0–H1.5) · both of us, in parallel

Order: Sam pushes the starter files first (5 min). Rishit waits for that push, pulls, then both work on 0B and 0F at the same time. Gate 0 is done together.

### 0B — Sam, backend (WSL2; repo under `~/`, never under `/mnt/c`)
- [ ] Copy the starter files into the repo (AGENTS.md, CLAUDE.md, README.md, root dotfiles, `.claude/settings.json`, `.githooks/`, docs/, shared/, backend/.python-version, backend/.env.example).
- [ ] `chmod +x .githooks/commit-msg` and `git config core.hooksPath .githooks` (strips AI attribution from commits). Commit and push.
- [ ] Scaffold:
  ```bash
  cd backend
  uv init --app --name subterra-backend --python 3.14
  rm -f main.py README.md            # uv's samples; our entry point is app/main.py
  uv add fastapi "uvicorn[standard]" pydantic pydantic-settings shapely numpy networkx pymupdf python-multipart httpx jinja2 anthropic
  uv add --dev ruff pytest
  cp .env.example .env
  ```
  If any package has no 3.14 wheel: `uv python pin 3.13`, then `uv sync`. Decide within 10 minutes.
- [ ] `app/__init__.py`, `app/config.py` (pydantic-settings reading `.env`), `app/main.py` with `GET /api/health` and CORS for `FRONTEND_ORIGIN`.
- [ ] Ruff config in `pyproject.toml`: line-length 100, target-version py314 (py313 if pinned), select `E,F,I,UP,B,SIM`.
- [ ] `uv run uvicorn app.main:app --reload --port 8000` → `http://localhost:8000/api/health` returns ok.

### 0F — Rishit, frontend (Windows)
- [ ] Prerequisites from "Before H0" done (Node 24, Git, `corepack enable`).
- [ ] Install uv for Windows (needed to run the backend at gates): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`.
- [ ] Clone (or pull) the repo after Sam's first push, then run once inside it: `git config core.hooksPath .githooks`.
- [ ] From the repo root: `pnpm create vite@latest frontend --template react-ts`, then `cd frontend`.
- [ ] `corepack use pnpm@latest` (pins `packageManager` so both machines use the same pnpm), then `pnpm install`.
- [ ] Tailwind v4: `pnpm add tailwindcss @tailwindcss/vite`; add the plugin to `vite.config.ts`; replace `src/index.css` with `@import "tailwindcss";`.
- [ ] Path alias: in `tsconfig.json` and `tsconfig.app.json` add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }`; `pnpm add -D @types/node`; in `vite.config.ts` add `resolve.alias` `@` → `src`.
- [ ] Also in `vite.config.ts`: `server.proxy` `/api` → `http://localhost:8000`, and `server.fs.allow: ['..']` so `../shared/mocks` can be imported.
- [ ] shadcn (needs Tailwind + alias first): `pnpm dlx shadcn@latest init` (Base UI default is fine), then `pnpm dlx shadcn@latest add button card badge tabs table dialog sheet slider switch tooltip separator scroll-area input textarea select sonner chart`.
- [ ] Libraries: `pnpm add three @react-three/fiber @react-three/drei @tanstack/react-query @tanstack/react-table zustand react-router motion lucide-react` and `pnpm add -D @types/three @biomejs/biome openapi-typescript`. Run `pnpm biome init`.
- [ ] `package.json` scripts: `typecheck` = `tsc -b`, `lint` = `biome check --write .`, `gen:api` = `openapi-typescript ../shared/openapi.json -o src/api/schema.d.ts`.
- [ ] `frontend/.env.development` (committed, no secrets): `VITE_USE_MOCKS=true`.
- [ ] `pnpm dev` → app at `http://localhost:5173`. Commit and push.

**Gate 0 (together):** both pull; `git status` is clean on both machines (no line-ending noise); `git log` on GitHub shows only your two usernames as authors; backend `/api/health` ok; frontend dev server runs. Rishit runs the backend once on Windows: `cd backend`, `copy .env.example .env`, `uv sync`, `uv run uvicorn app.main:app --port 8000`.

---

## Phase 1 — Core (H1.5–H7)

### 1A — backend: models + synthetic city
1. `app/models/` Pydantic models exactly per SPEC §7 (enums as `StrEnum`).
2. `app/data/rules.json` (SPEC §7.4, ids `R-…`).
3. `app/data/gazetteer.py`: 6 streets, ~8 junctions (include `J3` at Vikas Marg × Station Road), ~5 landmarks (include "Bus Depot"), fixed coordinates inside 600 × 400 m.
4. `app/data/generator.py` (`python -m app.data.generator`): `random.Random(42)`; assets along streets in lanes (telecom/power near kerbs, water mid-carriageway, sewer centre and deepest, gas on one side); 8–12 works; **planted cases T1–T9 with the exact values in SPEC §8.7**; writes `app/data/seed/scene.json` and `truth.json`.

### 1B — backend: geometry (tests first)
1. `tests/test_geometry.py` with hand-computed expected values, written before the code.
2. `app/engine/geometry.py`: 3D segment–segment distance, polyline–polyline distance, footprints per work type (SPEC §8.1), depth interpolation at closest point, excavation-vs-pipe gap (SPEC §8.2).

### 1C — backend: clash engine
1. `app/engine/detect.py`: STRtree candidates → gap → rule lookup → certainty (SPEC §8.3) → kind.
2. `schedule.py` (SPEC §8.4), `severity.py` (SPEC §8.5), `grouping.py` (NetworkX components + rank), `baseline.py` (SPEC §8.6), explanation templates.
3. `tests/test_planted_cases.py`: T1–T9 outcomes and the evaluation numbers in SPEC §8.7.

### 1D — backend: store + routes
1. `app/store.py`: in-memory state from seed, analysis on load, `reset()`.
2. Routes: `/api/scene`, `/api/rules`, `/api/clashes`, `/api/clashes/{id}`, `/api/groups`, `/api/reset`.
3. `scripts/export_openapi.py` → `shared/openapi.json`; commit it; note "frontend: run pnpm gen:api" in PROGRESS.

### 1E — frontend: data layer + shell
1. `src/api/client.ts` (fetch wrapper; when `VITE_USE_MOCKS=true` return JSON from `../shared/mocks`), `src/api/hooks.ts` (TanStack Query: `useScene`, `useClashes`, `useClash`, `useGroups`, `useSummary`).
2. `src/lib/coords.ts` (SPEC §6), `src/lib/colors.ts` (SPEC §10 palette), `src/lib/format.ts`.
3. `src/store/useAppStore.ts` (Zustand): selected clash, layer visibility, x-ray, halos, certainty filter, date filter.
4. App shell + React Router: `/` Landing (placeholder), `/workspace`, `/queue`, `/intake`, `/dashboard`. Dark theme, top nav.

### 1F — frontend: 3D scene
1. `features/scene3d/`: `SceneCanvas` (Canvas, OrbitControls, lights, fog), `Ground` (translucent plane, street outlines, labels), `Pipes` (TubeGeometry per asset, APWA colour), `WorkVolumes` (pink translucent boxes/tubes), `ClashMarkers` (pulse by certainty, click → select), `UncertaintyHalos`.
2. Left rail: layer toggles, certainty filter, x-ray and halo switches wired to the store.

**Gate 1 (H7):** set `VITE_USE_MOCKS=false`, `pnpm gen:api`, `pnpm typecheck` passes, the 3D scene renders the real seed with markers at the planted cases. Fix contract mismatches now, not later.

---

## Phase 2 — Features (H7–H13)

### 2A — backend: permit reading + LLM extraction
1. `app/permits/pdf_text.py` (PyMuPDF).
2. `scripts/make_sample_permits.py` → 3 PDFs in `app/permits/samples/` (clean English; Hinglish/messy; missing depth) using the gazetteer's real street and junction names.
3. `app/permits/extract.py`: structured LLM extraction (value + confidence + exact source_quote per field), 10 s timeout, `LLM_MODE=cached|live`, fixtures in `app/permits/fixtures/`, cache fallback on any error. Record the 3 fixtures once with a live call (or hand-write them if no API key).

### 2B — backend: geocoding + permit routes
1. `app/permits/geocode.py`: case-insensitive street / junction / landmark resolution with aliases ("J3", "stn rd"), side + offset → path, status RESOLVED / PARTIAL / FAILED with notes.
2. Routes: `POST /api/permits/parse`, `PATCH /api/permits/{id}`, `POST /api/permits/{id}/commit`, `GET /api/permits/samples`.
3. Missing-data handling end to end (missing depth → 0.5–3.0 m band → NEEDS_DATA / POSSIBLE).

### 2C — backend: review + audit
1. `POST /api/clashes/{id}/review` (DISMISS needs a note), audit log, `GET /api/audit`.
2. Re-export OpenAPI; note "frontend: run pnpm gen:api" in PROGRESS.

### 2D — frontend: clash panel
1. `features/clashes/ClashPanel.tsx`: badges, severity factor bar, measured / required / uncertainty, assets with source records, missing data, explanation, review actions (dismiss requires a note).
2. Camera fly-to on select (drei `CameraControls` or animated target).
3. `features/clashes/ConflictList.tsx` compact list in the workspace.

### 2E — frontend: cross-section
1. Draggable section plane in the 3D scene.
2. `features/section/CrossSection.tsx` (SVG): pipes as circles at depth, trench outline, dimension line "0.18 m measured / 0.60 m required".

### 2F — frontend: permit intake
1. `pages/Intake.tsx`: paste box, PDF drop zone, sample buttons → fields animate in with confidence chips and highlighted source quotes → editable fields → 2D path preview → "Add to coordination plan" → workspace with new clashes highlighted.

**Gate 2 (H13):** sample permit 1 → commit → workspace shows the new pink trench and its new clashes; review a clash and see the status change. Works with `LLM_MODE=cached`.

---

## Phase 3 — Depth (H13–H19)

### 3A — backend: summary + evaluation
1. `GET /api/summary` with counts and evaluation ours vs baseline (SPEC §8.7).
2. Group titles and explanation templates polished for every kind × certainty.

### 3B — backend: report + hardening
1. `app/report/`: Jinja2 HTML report + CSV (`GET /api/report`), disclaimer from SPEC §11.
2. Edge cases: empty results, unknown IDs (404), invalid review actions (422), bad PDF.
3. Performance: full analysis < 1 s on the seed.

### 3C — frontend: review queue
1. `pages/Queue.tsx`: TanStack table grouped by clash group, sortable, status filters, row → workspace selection, "Export inspection report" (opens `/api/report?format=html`) and CSV.

### 3D — frontend: dashboard + schedule
1. `pages/Dashboard.tsx`: number tickers, by-utility and by-certainty charts, ours-vs-baseline table with the T-cases.
2. `features/timeline/ScheduleStrip.tsx`: mini Gantt, overlap and dig-once links, date scrubber → filters the scene.

### 3E — frontend: polish layer
1. Landing hero (one wow effect only) + page transitions (Motion) + toasts on review/commit.
2. Loading skeletons and error states for every query.
3. Street-level view (SPEC §10): city context meshes, Street level / Overview camera transitions, X-ray fade of road + buildings.

**Gate 3 (H19):** run `docs/DEMO_SCRIPT.md` start to finish without touching code. Report prints cleanly. Street-level → X-ray reveal works in the demo.

---

## Phase 4 — Ship (H19–H24)

### 4A — Sam
- [ ] `backend/Dockerfile`, root `docker-compose.yml` (backend + frontend services); `docker compose up --build` works on a clean clone.
- [ ] README quickstart verified on a clean clone.
- [ ] Final seed tuning; `POST /api/reset` before the demo.

### 4B — Rishit
- [ ] `frontend/Dockerfile` (build, then serve static files with `/api` proxied to the backend service).
- [ ] Polish pass, empty states, keyboard: `Esc` closes the panel, `X` toggles x-ray.
- [ ] Check 1366×768 and 1920×1080.
- [ ] Record a 60-second backup screen capture of the demo.

**Both:** rehearse the demo twice. Freeze code at H23. Last hour = buffer + submission.

---

## Cut list (if behind schedule, drop in this order)
1. Stretch goals (SPEC §12) — never started unless Gate 3 is green.
2. Schedule strip date scrubber (keep the Gantt, drop filtering).
3. PATCH permit editing (commit as extracted).
4. CSV export (keep the HTML report).
5. Landing hero (go straight to the workspace).
6. Street-level view (keep the orbit view and X-ray ground fade).
7. Docker (run both dev servers for the demo instead).

**Never cut:** clash detail evidence, certainty classes, review queue, report, baseline comparison.