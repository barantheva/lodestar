# Lodestar Progress & Open Items

> Status ledger for the codebase as it actually is: what an audit found, what has been fixed, and what is still open. Design intent lives in `architecture.md` / `impl.md`. Update this file whenever an item closes or a new one is found.

**Snapshot: 2026-11-11** — Phases 0–7 built. `bun test`: **286 pass, 0 fail** (264 unit/integration + 22 e2e). `bun run typecheck`: clean. Nothing below is committed yet; the working tree also carries the earlier uncommitted Phase 7 work.

---

## 1. Fixed in this pass

| # | Finding | Fix | Where |
| :--- | :--- | :--- | :--- |
| F1 | **Dashboard could not be started.** README, user guide, install guide and `SKILL.md` all document `lodestar dashboard --port 3000`, but the CLI had no `dashboard` command. `createDashboardServer` was only ever called from tests. | Added `dashboard` command and `--port` flag. It reads the daemon's Fleet DB (`$DATA_DIR/fleet.sqlite` or `FLEET_DB_PATH`) and the configured knowledge backend. Smoke-tested: login, then `/stats` and `/users` return 200. | [`src/cli/index.ts`](../src/cli/index.ts) |
| F2 | **Auth DB lived in memory.** Users added via the Users Registry and all sessions were lost on restart, contradicting `screen-list.md` §9d (`auth.db`). | `lodestar dashboard` opens `$DATA_DIR/auth.db`. Tests still default to `:memory:`. | [`src/cli/index.ts`](../src/cli/index.ts) |
| F3 | **Weak password hashing.** Single salted SHA-256, compared with `===` (not constant-time). | argon2id via `Bun.password` (built in, no new dependency). Legacy SHA-256 rows from the seed SQL are checked with `timingSafeEqual` and rehashed to argon2id on first successful login. Users page, `screen-list.md` and `mock-ui.html` updated to match. | [`auth-db-client.ts`](../src/data-access/auth-db-client.ts), [`auth-service/index.ts`](../src/services/auth-service/index.ts) |
| F4 | **Default `admin`/`admin` could not be changed.** There was no reset UI and no override. | New `DASHBOARD_ADMIN_PASSWORD` sets the admin password at startup. Startup prints a warning while any account still has username = password. The spec'd seed accounts and Quick-Fill buttons are kept (see O1). | [`src/cli/index.ts`](../src/cli/index.ts), [`.env.example`](../.env.example) |
| F5 | **`DASHBOARD_PORT` was ignored.** Every doc and `.env.example` use `DASHBOARD_PORT`, but config read only `PORT`. | Config reads `PORT ?? DASHBOARD_PORT`. `PORT` wins so test overrides and hosting platforms keep working. | [`src/config/index.ts`](../src/config/index.ts) |
| F6 | **Clarity integration called a tool that doesn't exist.** `behavior-monitor` called `get_frustration_metrics`; `@microsoft/clarity-mcp-server` v2.0.1 only exposes `query-analytics-dashboard`, `list-session-recordings` and `query-documentation-resources`. Tests passed only because they injected fake signals. | Switched to the documented **Clarity Data Export API** (`project-live-insights`, `dimension1=URL`). This is a design change, recorded in `impl.md` §3 Phase 7. | [`clarity-client.ts`](../src/data-access/clarity-client.ts), [`behavior-monitor.ts`](../src/plugins/agents/behavior-monitor.ts) |
| F7 | **Clarity errors were swallowed.** A bad token, an exhausted quota or a wrong tool all returned `[]`, which looks like "no friction". | Non-2xx responses throw (a 429 is reported as "daily export quota exceeded"). The worker loop logs each batch's counts or its failure and keeps heartbeating. `worker --job behavior-monitor` exits non-zero when `CLARITY_API_TOKEN` is missing. | same |
| F8 | **Clarity token was visible in `ps`.** It was passed as `--clarity_api_token=` on the spawned `npx` command line. | Removed: no subprocess any more. The token travels only in the HTTPS `Authorization` header. | same |
| F9 | **Clarity config gaps.** `CLARITY_LOOKBACK_HOURS` was parsed but unused; there was no env var for the frustration score; quick-backs and excessive-scroll borrowed the dead-click threshold; one frustrated session on a quiet page could file an issue. | Lookback maps to `numOfDays` (1–3). Added `CLARITY_MIN_QUICK_BACKS`, `CLARITY_MIN_EXCESSIVE_SCROLL` and `CLARITY_MIN_FRUSTRATION_SCORE`. The score shortcut now needs at least 10 affected sessions. Removed the dead `CLARITY_PROJECT_ID`, `CLARITY_MCP_MODE` and `CLARITY_MCP_URL`. | [`config/index.ts`](../src/config/index.ts), [`.env.example`](../.env.example) |
| F10 | **Duplicate-issue check was incomplete.** It read only the first 30 *open* `behavior` issues, so closed or older issues were re-filed every batch. | `list_issues` gained `state` (`open`/`closed`/`all`) and pagination (100 per page, 10-page cap), which also fixes `issue-monitor` missing issues past #30. `behavior-monitor` checks `state: 'all'` and skips the batch if the issue list can't be fetched. | [`github-tool.ts`](../src/plugins/tools/github-tool.ts) |
| F11 | **`bun run typecheck` failed** with 2 errors in `behavior-monitor.test.ts`. | Fixed. Typecheck is clean. | [`behavior-monitor.test.ts`](../src/plugins/agents/behavior-monitor.test.ts) |
| F12 | **Docs claimed modules that don't exist.** README and `impl.md` named `data-access/github-client.ts`, `services/log-service/` and Slack/Discord/WhatsApp/Email dispatch as existing. | Marked **Not built** in `impl.md` §1/§1a and in the README. | [`impl.md`](impl.md), [`README.md`](../README.md) |
| F13 | **Stale status lines.** Phase 7 was still marked "Planned" and test counts were stale (257/271/278). | Updated in `impl.md`, README, `CLAUDE.md`, `AGENTS.md` and the install guide. | — |
| F14 | **Two Herdr docs.** `docs/headr.md` was a stub pointing to `docs/herdr.md` through an absolute `file://` link. | Merged into `herdr.md` and the stub deleted. Absolute links made relative; an inaccurate "SSE live streaming" claim corrected. | [`herdr.md`](herdr.md) |

---

## 2. Still open

### 2.1 Needs a decision

| # | Item | Notes |
| :--- | :--- | :--- |
| O1 | **Seeded default accounts** (`admin`/`admin`, `developer`/`developer`) plus the login page's Quick-Fill buttons that fill them in. | Both are in the spec (`screen-list.md` §0), so they were not removed. `DASHBOARD_ADMIN_PASSWORD` covers admin, but `developer`/`developer` has no override. Before any non-local deployment, decide whether to drop the developer seed and Quick-Fill, or gate them behind a dev flag. |
| O2 | **Dashboard binds all interfaces.** `Bun.serve` is called without a `hostname`. | Together with O1, a fresh install exposes a known login on port 3000. Consider binding to `127.0.0.1` by default unless deployment config says otherwise. |

### 2.2 Phase 7 (Clarity)
| # | Item | Notes |
| :--- | :--- | :--- |
| O3 | **Not yet run against a real Clarity project.** | Microsoft's docs only show a sample of the `Traffic` metric. The friction-row fields (`subTotal`, `sessionsCount`, `sessionsWithMetricPercentage`, `URL`) come from observed responses. One run with a real token would confirm `mapClarityInsightsToSignals`. |
| O4 | **No CSS selector or replay links in issues.** | The Data Export API has no element dimension or session IDs. A second source (the MCP `list-session-recordings` tool) could add them once its response shape is pinned down. |
| O5 | **A closed issue blocks re-filing forever.** | A regression on the same URL and friction type after a fix won't be reported again. Revisit with a time window if needed. |

### 2.3 Built but not connected
| # | Item | Effect |
| :--- | :--- | :--- |
| O6 | `state/sse-hub.ts` (`SseHub`) has no consumer. | No screen updates live; every screen re-reads from disk on each request. Docs elsewhere (user guide, `architecture.md`) still describe real-time SSE. |
| O7 | `monitor-service/metrics-service.ts` (`MetricsService`) is never constructed. | Stats come from `track-reader.ts` disk scans instead of the event-driven metrics. |
| O8 | `SessionMemory.persistDevJournal` and `persist_decision` have no caller in the real track flow. | Agents Log and Memories screens are real but usually empty. |
| O9 | Worker job types `incident-monitor`, `codebase-monitor` and `instrumentation-campaign` only heartbeat. | They show as running in the fleet but do no work. `incident-monitor` is blocked on O10. |

### 2.4 Documented but not built
| # | Item |
| :--- | :--- |
| O10 | `services/log-service/`: Sentry/CloudWatch/SigNoz webhook ingestion, PII scrubbing, exception dedup, archetype pre-triage. |
| O11 | Slack/Discord/WhatsApp/Email gateway dispatch. The config is parsed and displayed, but nothing sends. |
| O12 | `data-access/github-client.ts`. `github-tool.ts` owns its HTTP calls directly, so this is a layering drift only, not a functional gap. |
| O13 | Dashboard data with no source yet, shown honestly as empty: token/spend/MCP-call tracking, live worker stdout, per-stage timestamps, PR links, campaign execution. |

### 2.5 Verify
| # | Item |
| :--- | :--- |
| O14 | `McpClient` (used only by the LoadstoneNexus `remote` backend now) sends plain JSON-RPC POSTs with no `initialize` handshake or `Mcp-Session-Id`. That fails against a spec-compliant Streamable-HTTP MCP server, so check what the remote LoadstoneNexus server expects before relying on `LOADSTONENEXUS_MCP_MODE=remote`. |
| O15 | Test run time rose from ~2 s to ~6 s because argon2id is deliberately slow. Fine for now; lower the argon2 cost in tests if it grows. |

### 2.6 Deferred by design (`impl.md` §3)
SigNoz/OpenTelemetry, measure-sh, the multi-machine AMP mesh, and Instrumentation Campaign fan-out.

---

## 3. Next tasks (priority order)

1. **Commit the working tree.** Phase 7 plus this pass are uncommitted (~40 files).
2. **O1/O2:** decide on the default accounts and bind the dashboard to localhost by default.
3. **O3:** run `lodestar worker --job behavior-monitor --repo <test-repo>` once with a real Clarity token and confirm the field mapping.
4. **O6/O7:** connect `SseHub` and `MetricsService` to the dashboard, which makes the "live" claims true.
5. **O8:** call `persistDevJournal` and `persist_decision` from the track flow so Agents Log and Memories fill up.
6. **O10 → O9:** build the log service, then give `incident-monitor` real work.
7. **O11:** gateway dispatch on run outcomes.

## 4. How to verify
```bash
bun test                 # 286 pass
bun run typecheck        # clean
DATA_DIR=./data GITHUB_TOKEN=x bun run src/cli/index.ts dashboard --port 3000
# prints a default-password warning until DASHBOARD_ADMIN_PASSWORD is set
```
