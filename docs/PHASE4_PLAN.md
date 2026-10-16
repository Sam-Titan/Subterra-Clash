# Subterra Clash — Phase 4 Plan (revised 17 Oct 2026)

> Replaces the Phase 4 section of PHASES.md (old 4A/4B split by person).
> **From Phase 4 on, Sam owns the whole repo** (backend + frontend + docs). Rishit no longer runs sessions.
> **17 Oct: DEMO_SCRIPT.md is no longer required.** Tests and UI follow the core user flows listed in 4A, not a scripted demo. Labels may be renamed for clarity when the e2e specs change in the same commit.
> Same session loop as before: plan mode → review the plan → "manually approve edits" → checks → tick in PROGRESS.md → show files + message → "yes" → commit, pull --rebase, push → /clear.

## Order and why

| Session | What | Why this order |
|---|---|---|
| **4A** | Playwright harness: e2e smoke tests + screenshot capture at 1366×768 and 1920×1080, Playwright MCP for interactive checks | The UI clean-up needs before/after screenshots and a safety net so decluttering doesn't break the demo |
| **4B** | UI/UX clean-up (declutter) | Uses 4A's screenshots to audit and verify every change |
| **4C** | Playwright audit-and-fix loop | Run the full suite, read screenshots, fix bugs and UI mismatches, repeat until green |
| **4D** | Analytics (frontend) + request logging with real client IPs (backend, Render-ready) | Independent of the UI work; small |
| **4E** | Deployment: Render (backend), frontend host, Docker, README, seed tuning, lazy-loading | Last, once the app is stable |
| **Gate 4** | Full e2e suite against the **deployed** URLs + manual walkthrough of the core flows + offline fallback run locally; backup video | — |

## 4A — Playwright harness

- `@playwright/test` in `frontend/` (dev dep), `frontend/playwright.config.ts`, tests in `frontend/e2e/`.
- `webServer` starts **both** the backend (`uv run uvicorn app.main:app --port 8000` in `../backend`) and the frontend (`pnpm dev`) with `VITE_USE_MOCKS=false`; `reuseExistingServer: true`.
- Projects: `laptop` 1366×768 and `desktop` 1920×1080, Chromium only. WebGL in headless needs `--use-gl=angle --use-angle=swiftshader` (or `--enable-unsafe-swiftshader`); verify the canvas is non-blank.
- `globalSetup` calls `POST /api/reset` so every run starts from the seed.
- Tests cover the core user flows: landing counters (13/6/1); workspace loads scene; street level → X-ray → overview; select a clash (via the conflict list, not canvas clicks) → panel shows −0.6 / 1.0 / LIKELY; intake sample 2 → add to plan → toast + 3 new clashes; queue escalate with note → toast; report opens (HTML 200, contains disclaimer); dashboard shows 5/0/0 vs 2/1/3 and the T6 row; backend down → error + retry (route interception).
- Also: zero console errors (allow-list the known dev-only React unmount warning), no horizontal overflow, disclaimer visible in the viewport on every page, axe accessibility scan (`@axe-core/playwright`) reporting serious/critical only.
- `pnpm e2e` and `pnpm e2e:shots` (saves full-page screenshots to `frontend/e2e/screenshots/<project>/<page>.png`, gitignored).
- Add stable `data-testid`s where selectors would otherwise be brittle.
- Playwright MCP for Claude Code (interactive inspection): `claude mcp add playwright -- npx @playwright/mcp@latest`.
- WSL2 one-time: `pnpm exec playwright install --with-deps chromium`.

## 4B — UI/UX clean-up (declutter)

Goal: a judge understands each screen in 5 seconds. Principles:
- **One primary action per screen**, one accent colour for actions; utility colours only for utilities, certainty colours only for certainty.
- **Progressive disclosure**: summary first, details on demand. Clash panel: header (id, kind, certainty, severity), the gap/required/uncertainty line, explanation, review actions; evidence, assets, rule and factors in collapsible sections.
- **Workspace**: the 3D view gets the space. Left rail → compact icon toolbar with popovers (layers, filters, view modes); conflict list and schedule strip collapsible, collapsed by default; one floating view toolbar (Street level / Overview / X-ray / Section).
- **Consistent system**: 4/8 px spacing scale, 3 text sizes max per screen, one card style, fewer borders, fewer badges (badge only for certainty and band), consistent empty/loading/error states.
- **Nav**: Workspace · Queue · Intake · Dashboard; landing only at `/`.
- **Must keep** (domain rules): disclaimer visible, certainty classes visible, evidence reachable in one click, no approve/reject wording, every core flow still works (e2e green). Labels may be renamed for clarity if the e2e specs are updated in the same commit (assertions on values are never loosened).
- Process: take 4A screenshots → write an audit list (per page: clutter, inconsistency, hierarchy problems) → propose changes → implement → re-shoot → compare → e2e green.

## 4C — Playwright audit-and-fix loop

- Run `pnpm e2e` on both viewports; for every failure or screenshot problem (overlap, clipping, overflow, unreadable contrast, misaligned elements, labels inconsistent across pages, console errors, a11y serious/critical), fix and re-run. Cap at ~5 iterations; anything left goes to Blockers.
- Never "fix" a test by weakening it. Never change backend behaviour to make a UI test pass without saying so.

## 4D — Analytics + real client IPs

**Analytics (frontend):** PostHog via the `posthog-js` npm package (bundled, no CDN script).
- Off unless `VITE_POSTHOG_KEY` is set (and `VITE_POSTHOG_HOST`, default the EU or US cloud). Offline/local demo works with analytics off; nothing breaks if the host is unreachable.
- Autocapture off; manual pageviews on route change; custom events for the demo beats: `street_view_entered`, `xray_toggled`, `clash_selected`, `review_action` (action only, no reviewer name or note), `permit_parsed` (llm_mode_used, geocode status), `permit_committed` (new clash count), `report_exported` (format), `dashboard_viewed`.
- No personal data in events: no reviewer names, notes or permit text. `respect_dnt: true`, session recording off.
- Alternative if preferred: Umami (cookie-less) via the same env-gated wrapper `src/lib/analytics.ts`.

**Backend request logs with real client IPs on Render:**
- Render puts a proxy in front of the service and passes the client address in `X-Forwarded-For`; the socket address is Render's proxy, which is why logs show proxy IPs.
- Implement `app/middleware/client_ip.py`: resolve the client IP from `X-Forwarded-For` by taking the entry `TRUSTED_PROXY_HOPS` from the right (default 1 on Render; 0 locally = use the socket address). Never trust the leftmost entry blindly (it can be spoofed by the client). Also read `True-Client-IP` / `CF-Connecting-IP` only if `TRUST_CF_HEADERS=true` (when Cloudflare is in front).
- One JSON log line per request: time (UTC), method, path, status, duration_ms, client_ip, user_agent (truncated), request_id. Skip `/api/health` or log it at debug.
- Run uvicorn on Render with `--proxy-headers --forwarded-allow-ips='*'` so `request.client` and scheme are right, but the middleware's hop-based resolution is what goes into logs.
- `LOG_CLIENT_IP=full|masked|off` (default `masked` = last IPv4 octet / last 80 bits of IPv6 zeroed) — IPs are personal data; full only if Sam decides he needs it.
- Add a temporary `GET /api/debug/headers` only when `DEBUG_HEADERS=true`, to confirm on the deployed service which `X-Forwarded-For` position is the client; remove or keep disabled after.
- **Single worker** on Render: the store is in memory, so more than one worker would split state.
- Tests: hop resolution with 0/1/2 hops, spoofed leftmost entry ignored, masking, malformed header falls back to the socket address.

## 4E — Deployment

- Backend on Render (web service, Docker or native Python): `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*' --workers 1`; env: `LLM_MODE=cached`, `DEMO_DATE=2026-10-28`, `FRONTEND_ORIGIN=<frontend URL>`, `TRUSTED_PROXY_HOPS=1`, `LOG_CLIENT_IP`.
- Frontend: static build (Render static site or Netlify). `VITE_API_BASE` for the backend URL (CORS) or a host rewrite for `/api/*` (adds one proxy hop → set `TRUSTED_PROXY_HOPS` accordingly).
- Free-tier sleep: the first request after idle is slow and resets the in-memory store — warm the service and `POST /api/reset` before the demo.
- Docker + compose for a one-command local run; README quickstart verified on a clean clone; lazy-load pages (main chunk 804 kB); seed tuning (filler works only, never T1–T9).
- Keep the **local offline run** as the stage fallback.