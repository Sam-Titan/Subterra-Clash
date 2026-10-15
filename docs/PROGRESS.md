# Subterra Clash — Progress

> Live checklist and the memory between agent sessions. Update it in the same commit as the work, **before** clearing the session.
> Format: `- [x] 1B — geometry + tests — Sam — short note`. Add blockers under "Blockers" immediately.
> Session details are in `docs/PHASES.md`.

**Current phase:** 1 — Core
**Kickoff (H0):** 16 Oct 2026, 01:00 IST
**Last gate passed:** Gate 0
**Pending for frontend:** _e.g. "run pnpm gen:api" — clear once done_

---

## Phase 0 — Setup
- [x] 0B — backend scaffold, /api/health, Python 3.14 wheels confirmed (or pinned 3.13) — Sam — py3.14.4, all deps resolve; no 3.13 pin needed; root `nvmrc` renamed to `.nvmrc`
- [x] 0F — Vite + Tailwind + shadcn + libs + proxy + mocks mode; uv installed on Windows — Friend
- [x] **Gate 0 passed**

## Phase 1 — Core
- [x] 1A — models + rules + gazetteer + seed generator with T1–T9 — Sam — 72 assets, 11 works (WRK-001..011); planted assets dedicated + exact SPEC values, tests assert them; rules `applies_to` = `{work_types, utility[], work_utility[]}` (empty = any), contract updated; Evidence.type values: ASSET_RECORD, PERMIT, RULE, PRECISION; HDD depth_from/to = bore top/bottom, PIPE_LAY depth_to = centre depth + d/2
- [ ] 1B — geometry + tests — Sam
- [ ] 1C — detect / certainty / schedule / severity / grouping / baseline + planted-case tests — Sam
- [ ] 1D — store + routes + OpenAPI exported — Sam
- [ ] 1E — API client + hooks + mocks mode + coords/colors + store + shell + routes — Friend
- [ ] 1F — 3D scene (ground, pipes, works, markers, halos) + left rail — Friend
- [ ] **Gate 1 passed**

## Phase 2 — Features
- [ ] 2A — PDF text + sample permits + LLM extraction + cached fixtures — Sam
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
_none_

## Decisions log
- Python 3.14 (fallback 3.13 if wheels missing).
- One repo, everyone commits to `main`, no branches. Sam owns `backend/`, `docs/`, `shared/`, root config; Friend owns `frontend/` (and may tick boxes in this file).
- AGENTS.md is the shared rules file (Claude Code reads it via `@AGENTS.md` in CLAUDE.md; Antigravity reads it natively).
- One agent session per session ID; plan → approve → build → checks → update this file → commit → clear.
- No AI attribution in commits or PRs: `.claude/settings.json` hides Claude Code's trailer, AGENTS.md forbids it, `.githooks/commit-msg` strips it. Each clone runs `git config core.hooksPath .githooks` once.