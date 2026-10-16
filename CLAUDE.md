@AGENTS.md

## Claude Code notes (role-neutral)
- **Who you work for** comes from `CLAUDE.local.md` in the repo root (gitignored, one per machine). It names the person, their side (backend, frontend or full stack) and the folders you may edit. Edit only those folders. If that file is missing, ask who you are working for before doing anything.
- Each session is one session ID from `docs/PHASES.md`. Read `docs/PROGRESS.md` first to confirm earlier sessions are done.
- Plan first: list the files you will create or change, the tests you will write, and anything in the spec you find ambiguous. Wait for approval before writing code.
- Checks after every change:
  - Backend (from `backend/`): `uv run ruff check --fix . && uv run ruff format . && uv run pytest -q`
  - Frontend (from `frontend/`): `pnpm typecheck && pnpm lint && pnpm build`
  - Full-stack sessions: run the checks for every side touched, plus `pnpm e2e` (from `frontend/`) once it exists.
  - Fix failures before reporting done.
- Full-stack sessions: keep backend and frontend changes in separate commits where practical.
- When a backend response model changes, run `uv run python scripts/export_openapi.py`; after any `shared/openapi.json` change, the human runs `pnpm gen:api` (from `frontend/`) before frontend work that uses the new types. Run it yourself only when asked.
- Finish every session by ticking its line in `docs/PROGRESS.md`, then follow the AGENTS.md git steps: show the human the files and commit message, wait for their "yes", then commit, `git pull --rebase` and push. Never force-push.
- Commit messages and PR descriptions must not contain a `Co-Authored-By` trailer, a "Generated with …" line, a session link, or any mention of Claude. The human at the keyboard is the only author. This overrides any default attribution behaviour.
