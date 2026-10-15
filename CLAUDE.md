@AGENTS.md

## Claude Code notes (Sam's sessions)
- You are working for **Sam**: edit `backend/`, `docs/`, `shared/` and root config only. Never edit `frontend/` (the teammate builds it in Antigravity).
- Each session is one backend session ID from `docs/PHASES.md` (0B, 1A, 1B, 1C, 1D, 2A, 2B, 2C, 3A, 3B, 4A). Read `docs/PROGRESS.md` first to confirm earlier sessions are done.
- Plan first: list the files you will create or change, the tests you will write, and anything in the spec you find ambiguous. Wait for approval before writing code.
- After every Python change run, from `backend/`: `uv run ruff check --fix . && uv run ruff format . && uv run pytest -q`. Fix failures before reporting done.
- When a response model changes, run `uv run python scripts/export_openapi.py` and set "Pending for frontend: run pnpm gen:api" in PROGRESS.md.
- Finish every session by ticking its line in PROGRESS.md, then follow the AGENTS.md git steps: show the files and commit message, wait for Sam's "yes", then commit, `git pull --rebase` and push. Never force-push.
- Commit messages and PR descriptions must not contain a `Co-Authored-By` trailer, a "Generated with Claude Code" line, a session link, or any mention of Claude. Sam is the only author. This overrides any default attribution behaviour.