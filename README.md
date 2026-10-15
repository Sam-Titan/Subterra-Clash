# Subterra Clash

**See underground before you dig.** A 3D review tool that finds probable spatial and schedule conflicts between proposed underground works and existing utilities, shows the evidence and uncertainty behind each one, and ranks them for engineering review. It never approves or rejects a permit.

Code-E-Manipal 2.0 · Problem Statement 32 · Smart City & Infrastructure

All data is synthetic (fictional area "Navgarh — Sector 7"). Clearance values are illustrative.

---

## One-time setup per clone

```bash
git config core.hooksPath .githooks   # keeps commit messages free of AI attribution
```
Prerequisites are listed in `docs/PHASES.md` → "Before H0".

## Quickstart (development)

**Backend** (Python 3.14, [uv](https://docs.astral.sh/uv/))
```bash
cd backend
uv sync
cp .env.example .env          # set LLM_MODE=cached to run fully offline
uv run python -m app.data.generator
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend** (Node 24, pnpm via corepack)
```bash
cd frontend
corepack enable
pnpm install
pnpm dev                      # http://localhost:5173
```

**Docker** (Phase 4)
```bash
docker compose up --build
```

## Docs
| File | What |
|---|---|
| `docs/SPEC.md` | Product, data model, clash engine rules |
| `docs/PHASES.md` | Build plan and integration gates |
| `docs/PROGRESS.md` | Live checklist |
| `docs/API_CONTRACT.md` | Endpoints and payloads |
| `docs/DEMO_SCRIPT.md` | 4-minute judge demo |
| `AGENTS.md` | Rules for coding agents (Claude Code, both of us) |

## Team
- Sam — backend, clash engine, permit intake (Claude Code)
- Rishit — frontend, 3D viewer (Claude Code)