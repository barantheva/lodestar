# Lodestar Live Operations Dashboard - Screen List Catalog

A comprehensive breakdown of all UI views, dashboards, and control surfaces in the **Lodestar** operations interface. `mock-ui.html` in the repo root is the visual mock for this catalog.

---

## 0. Screen 0: Authentication & Sign In (`/login`)

- **Primary Objective**: Strict gatekeeper and operator access control powered by SQLite database (`users` and `sessions` tables). Without logging in, all dashboard views, pipelines, metrics, and navigation menus are locked and invisible.
- **Default User Accounts**:
  - `admin` / `admin` (Role: `admin`, full control plane access)
  - `developer` / `developer` (Role: `developer`, operator access)
- **User Extensibility**: User initialisation and schema live in standalone SQL (`src/data-access/sql/users.sql` and `user_insert.sql`) for modular user expansion.
- **UI Components & Security Flow**:
  - **Auth Barrier**: Unauthenticated visitors are automatically routed to the Login screen; sidebar navigation and topbar controls remain locked until authenticated.
  - **Glassmorphic Sign-In Box**: Clean dark-mode login card with username/password inputs and 1-click Quick-Fill credential buttons.
  - **User Profile & Logout Prompt**: Clicking the user badge/icon in the topbar (`👤 username (role) ▼`) opens an interactive dropdown prompt displaying user details, active SQLite session status, account switcher, and a prominent **"Log Out / Sign Out"** button.
  - **Sign Out Action**: Clicking Sign Out immediately ends the active session, locks the interface, hides all screens, and returns to Screen 0 with a signed-out notification.

---

## 1. Screen 1: My Stats / Master Overview (`/stats`)

- **Primary Objective**: Executive summary of system health, active Relay pipeline stages, token consumption, and model spend — **cumulative across every monitored repository**, not scoped to one. Repos stats breakdown lives on Screen 1b.
- **UI Components**:
  - **Rate-Limit Sentinel Banner**: Real-time quota and 429 monitoring with non-blocking sleep countdowns across all model providers (Claude, DeepSeek, Gemini, Kimi, OpenAI) at the very top of the overview.
  - **Relay 6-Stage Lifecycle Operations Matrix**: A 2-column by 3-row workflow matrix displaying all 6 stages (`1. Intake`, `2. Shape`, `3. Plan`, `4. Build`, `5. Verify`, `6. Ship`) with clear stage headers, active status badges, and `[＋ Connections & Rules]` expandable drawers detailing service connection health and stage prerequisites.
  - **Shipped Tracks & Lead Certification Widgets**:
    - **Shipped Tracks (Approved by Lead)**: 30-day volume breakdown by repo (`casbin-gateway`, `hanoi-rainbow`, `dashboards`), archetype, and named Lead signers with zero-bypass rate and opt-in deploy counts.
    - **Lead Sign-Off Velocity & Evidence SLA**: Cycle time (Intake → Ship), average Lead turnaround time, 100% evidence package verification (5 artifacts/track), and deployment rollback rate.
  - **3-Agent Pool Widget**: Status cards for Agent 1 (Log Watcher), Agent 2 (Code Fix Resolver), and Agent 3 (Slack/Project Monitor).
  - **MCPs Server Card**: Call volume, error rates per MCP server (CodeGraph, Graft, LoadstoneNexus), org-wide.
  - **Tokens Ledger Card**: Multi-model breakdown (Cache Reads, Cache Writes, Input, Output) with daily volume charts, org-wide.
  - **Spend & Cost Card**: Estimated dollar spend per model (Claude, DeepSeek, Gemini, Kimi, OpenAI), org-wide total.

---

## 1b. Screen 1b: Repos Stats (`/repos`)

- **Primary Objective**: The single-repository breakdown that Screen 1 deliberately excludes — same 30d metrics, split per monitored repository.
- **UI Components**:
  - **All Monitored Repositories Table**: One row per repo — tracks resolved, spend, tokens, MCP calls, and current active agent, at a glance.
  - **Repo Tabs**: Pick one repo to drill into its own MCP-calls, token-breakdown, and spend cards (same widgets as Screen 1, scoped to that repo) plus a link into that repo's Guard Document Browser entries (Screen 6).

---

## 2. Screen 2: Relay Pipeline & Guard Control (`/relay`)

- **Primary Objective**: Live monitoring and management of Relay Architecture handoffs, the 6-stage Relay lifecycle (Intake, Shape, Plan, Build, Verify, Ship), Guard 1 intent certification, Guard 2 plan approval, and Guard 3 evidence certification with AI Maestro AMP synchronization.
- **UI Components**:
  - **Interactive 6-Stage Relay Lifecycle Stepper**: Visual progress tracker through `1. Intake` (`/intake-routing`), `2. Shape` (Guard 1: `intent.md` — Analyst), `3. Plan` (Guard 2: `plan.md` — Engineer), `4. Build` (`relay-implementer` → `relay-stop-slop` PASS), `5. Verify` (`relay-reviewer` · SAST / rebase check), and `6. Ship` (Guard 3: `guard-evidence.md` + `evidence.json` — Lead). **Clicking any specific step** opens and filters the collapsible **Stage Audit History** panel below.
  - **3 | 3 Column Stage Grid**: A structured 2-row by 3-column layout organizing the 6 Relay stages with dedicated cards and interactive expandable requirement boxes:
    - **Row 1 (Definition & Planning)**:
      - **Col 1 (1. Intake)**: Ingestion streams (Sentry/CloudWatch/SigNoz), archetype routing (A/B/C/H), and Bolt opening. Includes an **expandable requirement box** for ingestion rules.
      - **Col 2 (2. Shape & Guard 1)**: Baton `intent.md`, multi-app `/impact-assesment`, and Analyst certification queue. Includes an **expandable requirement box** for Guard 1 invariants.
      - **Col 3 (3. Plan & Guard 2 + AMP Sync)**: Baton `plan.md`, Git worktree allocation, agent self-signing, gated path overrides, and **AI Maestro AMP Mesh sync** (`http://localhost:23000`). Includes an **expandable requirement box** for plan rules and AMP sync.
    - **Row 2 (Execution & Delivery)**:
      - **Col 4 (4. Build & Slop Gate)**: TDD/Playwright cycles, Google Style compliance, `comments.md` rules, and `relay-stop-slop` zero dead code gate. Includes an **expandable requirement box** for build gates.
      - **Col 5 (5. Verify & SAST)**: Pre-merge rebase check against base branch, `relay-reviewer` AST review, and SAST security scans. Includes an **expandable requirement box** for verification gates.
      - **Col 6 (6. Ship & Guard 3 + AMP Alerts)**: `relay-auditor` Baton evidence pack (`guard-evidence.md` + `evidence.json`), Lead certification (zero bypass), opt-in auto-deploy (Bolt closes), and **AMP gateway alert dispatches** to Slack (`#dev-alerts`), Discord, WhatsApp, and Email. Includes an **expandable requirement box** for Guard 3 rules.
  - **Collapsible Stage Audit History Panel (Across All Monitored Repositories)**:
    - Positioned directly beneath the 6-stage operations grid; dynamically reveals audit log entries for the selected stage when clicking any stepper node or stage tab.
    - **Multi-Repository & Time Window Filters**: Filterable across all repositories simultaneously (`apache/casbin-gateway`, `hanoi-rainbow`, `dashboards`) or scoped to a single target repo; synchronized live with topbar time pills (`Today`, `7d`, `30d`, `90d`).
    - **Immutable Audit Log Table**: Displays timestamp, repository badge, track/issue ID, stage invariant badge, actor/signer moniker (`Analyst: Sarah Chen`, `Lead: Alex Chen`, `relay-stop-slop`, `relay-reviewer`, LLM self-signers), audit actions/checkpoints, and direct links to Baton evidence artifacts (`intent.md`, `plan.md`, `guard-evidence.md`, `evidence.json`) persisted in LoadstoneNexus MCP / Obsidian (`persist_guard_document`).
    - **Collapsible Summary Drawer**: Can be toggled open/closed at any time, maintaining active stage and repository filter state.

---

## 3. Screen 3: My Fleet & Agent Supervisor (`/fleet`)

- **Primary Objective**: Named worker process supervision, resource tracking, and process health controls.
- **UI Components**:
  - **Worker Selector & Selector Filter**: Filter by repository (`apache/casbin-gateway`) or agent moniker (`worker-alpha`).
  - **Job & Model Assignment** (per worker row): assign one of the four job types — **App/Log & Incident Monitor**, **Issue Monitor**, **Codebase Monitor**, **Instrumentation Campaign** (`architecture.md` §8) — and a model provider (Claude, DeepSeek, Gemini, Kimi, OpenAI) per agent, live from the UI. This is the deployment-time `AGENT_N_JOB`/`AGENT_N_PROVIDER` config (`deployment.md`) made editable at runtime, not just at deploy.
  - **Process Sensor Metrics**: Real-time PID, RSS memory footprint (MB), CPU %, heartbeat pulse (every 5s), and current worktree status — read from the local Fleet DB (SQLite), not LoadstoneNexus.
  - **Live Stream Log Viewer**: Split-pane stdout/stderr tailing for running worker instances.
  - **Process Control Actions**: Restart worker, kill worker, adjust auto-wait sentinel configuration.

---

## 4. Screen 4: AI Maestro AMP Mesh & Gateways (`/amp`)

- **Primary Objective**: Monitoring inter-agent messaging, peer mesh node synchronization, and external communications.
- **UI Components**:
  - **AMP Peer Mesh Graph**: Interactive visual map of connected machine nodes. Default deployment is a **single AWS EC2 instance** managing the whole lifecycle (control plane + all named workers as supervised OS processes, per `deployment.md`'s VM sizing) — no separate control-plane machine. A multi-machine mesh (additional EC2/Hetzner/DigitalOcean instances joining as peer nodes) is an opt-in scale-out, not the default.
  - **Agent-to-Agent Message Feed**: Real-time protocol payload log (Sender Agent $\rightarrow$ Recipient Agent, priority level, digital signature).
  - **Organizational Gateways Panel**: Channel routing configurations for Slack (`#dev-alerts`), Discord, WhatsApp, and Email.
  - **Prompt-Injection Defense Sensor**: Log of blocked prompt injection patterns (34 rules active).

---

## 5. Screen 5: CodeGraph & Graft Repository Knowledge (`/knowledge`)

- **Primary Objective**: Exploration of semantic AST code graphs, Graft repository maps, and architectural indices.
- **Data access**: Graft runs local-only (stdio MCP server on the worker's host, per `architecture.md` §3) — this screen reads its output from the cached local knowledge snapshot the worker already wrote, not by querying Graft again per page view. Keeps repeated dashboard views from re-triggering repo-map generation or pushing raw maps through the model.
- **UI Components**:
  - **AST Symbol Hierarchy Navigator**: Cross-file caller/callee graphs, struct/interface definitions, and function dependency trees.
  - **Graft Module API Explorer**: Public API signatures, exported symbols, and module boundary maps (`graft_repo_map`).
  - **Solution History Vault**: Index of past fixed issues and reusable code patches.

---

## 6. Screen 6: LoadstoneNexus Memory & Decisions Ledger (`/memories`)

- **Primary Objective**: Deep recall into past branch decisions, architectural journals, Guard documents, and living project documentation.
- **Data access**: this screen calls the LoadstoneNexus MCP server's `retrieve_knowledge`/`retrieve_decisions`/`retrieve_guard_document` tools — it never reads `$DATA_DIR` files directly, so the dashboard works the same whether the store is local or remote.
- **UI Components**:
  - **Branch Recall Ledger**: Historical branch decisions, token budgets, and captured decision quotes.
  - **Architectural Decision Journal (ADR)**: Extracted architectural principles, fetched through the MCP server.
  - **Guard Document Browser**: Per-track `intent.md` / `spec.md` / `plan.md` / `guard-evidence.md` / `evidence.json`, with each Guard's sign-off history (Analyst, agent self-sign, Lead).
  - **Living Documentation Engine**: Auto-generated markdown documentation built from codebase changes.

---

## 7. Screen 7: Run History & Savings (`/history`)

- **Primary Objective**: A record of every track Lodestar has resolved — grouped by job type — plus the ROI those resolutions represent.
- **UI Components**:
  - **Savings Summary**: Estimated $ saved vs. manual fix, hours saved, and total tracks resolved (broken down by Issue / Incident / Codebase Monitor / Instrumentation Campaign), over a rolling window.
  - **Run History (tabbed by job type)**: **Issues Fixed**, **Incidents Resolved**, **Codebase Findings**, **Instrumentation Campaigns** — each a table of track ID, title/finding, archetype (or RCA status for incidents), resolution date, and the resulting PR (new, or updated for Codebase Monitor).
  - **Notified column**: per-run delivery status to each connected organizational gateway (Slack, Discord, WhatsApp, Email) — sent vs. pending. Undelivered notifications retry with the same rate-limit hold-and-resume logic as agent jobs (`architecture.md` §6).

---

## 7b. Screen 7b: Release Tracker (`/releases`)

- **Primary Objective**: Per-repo view of every tag Lodestar has cut, and which tracks each one shipped — separate from Run History, which is per-track, not per-release.
- **UI Components**:
  - **Last Created Tag, per Repo**: the most recent tag for each monitored repo, at a glance.
  - **All Releases table**: tag, repo, created timestamp, commit, changelog filename, the tracks it bundles, and gateway-notified status (same Notified pattern as Screen 7).
  - Tag/changelog data is cached from GitHub the same way the Knowledge screen (§5) caches Graft/CodeGraph output — not re-fetched per page view.

---

## 7c. Screen 7c: Create Release (`/release-new`)

- **Primary Objective**: Cut a new release for a chosen repo — tag and changelog filename are always derived, never hand-typed.
- **Naming convention (not configurable — see `architecture.md` §10)**: tag = `dd-mm-yyyy-<short commit hash>` (today's date + last 7 chars of the target repo's default-branch HEAD SHA); changelog file = `change-log-<same tag>.md`, committed to that repo's `changelogs/` alongside the tag.
- **UI Components**:
  - **Create Release form**: repository picker; read-only preview of the computed tag and changelog filename (recompute live on repo change); count of tracks merged since that repo's last tag.
  - **Changelog Preview**: auto-drafted from Run History's tracks resolved on that repo since its last tag, grouped the same way (Issues Fixed / Codebase Findings / etc.) — editable before creating.
  - **Confirm & Create**: one action creates the tag, commits the changelog, pushes both, and broadcasts to connected gateways — landing back on Release Tracker (§7b).

---

## 8. Screen 8: Agents Log (`/agents-log`)

- **Primary Objective**: A single, chronological, cross-agent log stream — as distinct from the Fleet screen's per-worker split-pane stdout/stderr viewer.
- **Data access**: every log line is tagged with the agent's name and, alongside the local Fleet DB copy, persisted to **LoadstoneNexus MCP as a dev-journal entry** (`persist_knowledge`, collection `dev-journal/<agent-name>`) — project knowledge, queryable later per agent, not just instance-local operational bookkeeping.
- **UI Components**:
  - **Unified Log Viewer**: Timestamped lines across all agents, filterable by agent moniker, tagged by pipeline stage (`relay-implementer`/`relay-stop-slop`/`relay-reviewer`/`relay-auditor`/sentinel).
  - **Dev-Journal Confirmation**: each line shows whether it's been persisted to LoadstoneNexus MCP yet, so a delayed persist (e.g. during a rate-limit hold) is visible, not silent.

---

## 9. Screen 9: Skill Install (`/setup`)

- **Primary Objective**: First-run installation — get the skill installed and discoverable without leaving the dashboard. Hands off to Screen 9b for actual configuration.
- **UI Components**:
  - **Install Steps**: `skill install lodestar`, a check confirming which harnesses (Claude Code, Antigravity, Gemini, Cursor, Codex, OpenCode) have picked it up, and generating `.env` from `.env.example`.

---

## 9b. Screen 9b: Configuration (`/config`)

- **Primary Objective**: Environment and fleet-default configuration, separate from the one-time install flow — this is the page you come back to when settings change, not just on first run.
- **UI Components**:
  - **Environment Configuration Form**: `TEAM_MODE` (solo/team), `ANALYST_NAME` & `LEAD_NAME` (human gate signers for team mode), `ALLOW_AUTONOMOUS_INCIDENT_DECLARATION`, `GITHUB_TOKEN`, `GITHUB_REPO` (comma-separated `owner/repo` list — one token, one poller, fanning out across every listed repo), per-provider API keys, `AGENT_COUNT` — editable inline, masked where secret.
  - **Knowledge Backend Panel**: `KNOWLEDGE_BACKEND` picks `loadstonenexus` (default) or `obsidian` — same project-knowledge/Guard-document contract, different storage. LoadstoneNexus fields: `LOADSTONENEXUS_MCP_MODE` (local stdio vs. shared `remote`), `LOADSTONENEXUS_MCP_URL`, `DATA_DIR`, `KNOWLEDGE_BASE_DIR`. Obsidian fields: `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_MCP_URL`/`OBSIDIAN_API_KEY` (Local REST API plugin). Only the active backend's fields are enabled.
  - **Organizational Gateways Panel**: `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `WHATSAPP_API_TOKEN`/`WHATSAPP_BROADCAST_LIST`, `SMTP_URL`/`ALERT_EMAIL_TO` — each independently optional; connected status here mirrors the live status shown on the AMP Mesh screen (§4).
  - **Observability & Optional Integrations**: one-click SigNoz/OpenTelemetry and measure-sh install, both deferred by default.
  - **Agent Fleet Defaults**: initial per-agent job (`architecture.md` §8) and model provider assignment, the same control surfaced live on the My Fleet screen (`architecture.md` §7) — set once here, adjustable later there.

---

## 9c. Screen 9c: Monitor Setup & Multi-Repo Campaigns (`/monitorsetup`)

- **Primary Objective**: Dedicated operational control plane for configuring telemetry monitoring and launching multi-repository change campaigns (e.g. OpenTelemetry tracing wrappers, Logtail ingestion filters, bulk dependency updates, cross-repo contract migrations) outside the per-track Relay pipeline.
- **UI Components**:
  - **Master Enable/Disable Toggle**: Top status control to enable or disable autonomous multi-repo campaign execution and monitoring ingestion.
  - **Repository Multi-Selector**: Checkbox grid displaying all configured repositories with "Select All" / "Clear All" actions to target specific repos for a campaign run.
  - **Campaign Change Definition Form**:
    - **Campaign Type**: Dropdown selection for predefined campaign transformations (SigNoz/OTel wrappers, Logtail ingestion, shared contract interface migration, dependency bumps).
    - **Target Symbol / File Pattern**: Glob/regex pattern identifying source files and API endpoints to transform.
    - **Assigned Model Provider**: Model selector (Claude, DeepSeek, Gemini, Kimi, OpenAI) used to execute the code modifications.
  - **Execution Trigger**: Primary **"Run this change"** action button that initiates the fan-out across selected repositories.
  - **Batch Execution Status Table**: Live progress table displaying target repository, campaign scope, discovered endpoints, execution status, branch/PR links, and Guard document links.

---

## 9d. Screen 9d: SQLite Users Registry — Admin Only (`/users`)

- **Primary Objective**: Centralized user registry and role authorization control plane powered by SQLite (`auth.db`). Restricted strictly to users with the `admin` role.
- **Role-Based Access Control (RBAC)**:
  - **Admin Accounts (`admin`)**: Can view, add, and manage operator accounts, reset credentials, inspect active SQLite session tokens, and revoke sessions.
  - **Developer Accounts (`developer`)**: The Users Registry sidebar menu item is hidden, and direct route access is strictly blocked.
- **UI Components**:
  - **Admin Security Banner**: Highlights elevated administrative privilege status.
  - **Operator Metric Cards**: Live metrics for Total Users, Active Administrators, Pipeline Developers, and Cryptographic Hash Engine (argon2id via `Bun.password`; legacy salted SHA-256 rows from the seed SQL are rehashed on first successful login).
  - **Operator Registry Table**: Searchable table displaying User ID (`usr_...`), Username, Role pill (`admin` / `developer`), Full Name, Email, Status, and action triggers.
  - **Add New Operator Form**: Interactive form to provision new operators with username, temporary password, role selection, full name, and email.
  - **Active Sessions Ledger**: Live table of active session tokens (`sessions` table) with creation timestamp, 24-hour expiration countdown, security flags (`HttpOnly; SameSite=Lax`), and instant session revocation.
  - **Raw SQL Seed & Migration Explorer**: Syntax-highlighted viewer of `src/data-access/sql/users.sql` schema and `user_insert.sql` initialisation.

---

## 10. Brand & UI Identity Assets

- **Brand Logo & Mark**: **Lodestar Polaris Compass Star** — 4-pointed faceted navigational beacon with crystalline depth, electric cyan/blue (`#38bdf8`) and indigo/violet (`#818cf8`) accents against dark charcoal background (`#0d1117`).
- **Asset Sources**:
  - **Vector SVG**: [`docs/lodestar-logo.svg`](file:///Users/ragu/Code/lodestar/docs/lodestar-logo.svg)
  - **Mock UI Brand Mark**: Integrated directly in [`docs/mock-ui.html`](file:///Users/ragu/Code/lodestar/docs/mock-ui.html) sidebar header (`.brand-logo`).
  - **StitchMCP Project**: `projects/10574207549325393398` (Screen `3eabd8a87ab2488f881e76439a78d709`) & `projects/312485883767820901` (Screen `c74e6a03362f4f68970717d942a1222c`).

