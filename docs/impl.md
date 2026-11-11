# Lodestar: Implementation Plan

> Translates `architecture.md` (design) and `plan.md` (roadmap) into a buildable, file-level plan: what to build, in what order, against what contracts, with what "done" looks like. Read `architecture.md` §1/§3 and `plan.md` §5/§6 first — this document doesn't repeat their rationale, only turns it into tasks.

**Current state: Phases 0–7 built and passing; Phase 7 still needs one run against a live Clarity project (see Phase 7 status in §3). Open items across all phases are tracked in `progress.md`.** `src/` has config/interfaces/event-bus (Phase 0), the single-provider happy path with git/github/code-exec tools (Phase 1), knowledge/memory backends (Phase 2), the Guard 1/2/3 state machine in `engine.ts` (Phase 3), the multi-model 4-agent pipeline (Phase 4), Fleet DB + supervisor + `worker`/`daemon` CLI subcommands + track resumability (Phase 5), the event-driven metrics engine + opt-in deploy/auto-rollback (Phase 5b), and all 16 `screen-list.md` dashboard screens (Phase 6, now including Login §0, Monitor Setup §9c, and the admin-only Users Registry §9d added when `mock-ui.html`/`screen-list.md` grew from 13 to 16 screens) — 286 tests passing (264 unit/integration + a 22-case `e2e/dashboard.test.ts`). Every screen reads a real data source; where this codebase genuinely has none yet (token/spend/MCP-call tracking, live worker stdout, decision-journal persistence, campaign fan-out execution), the screen says so honestly instead of showing the mock's numbers — see §4 below and the Phase 6 entry in §3. The session-login system (`services/auth-service/`, `data-access/auth-db-client.ts`, `dashboard/features/auth/`) that appeared mid-Phase-6 is now formally documented in `screen-list.md` §0 and its schema/seed genuinely load from `src/data-access/sql/{users,user_insert}.sql` (fixed — they existed as decorative files the code duplicated inline before); it's no longer undocumented scope. Passwords now hash with argon2id (`Bun.password`; legacy seed SHA-256 rows are rehashed on first login), `lodestar dashboard` persists `$DATA_DIR/auth.db`, and `DASHBOARD_ADMIN_PASSWORD` overrides the seeded admin password — the spec'd `admin`/`admin` + `developer`/`developer` defaults remain, and startup warns while any is still in use. Phase 7 (Clarity behavioral telemetry + the `behavior-monitor` worker) is built against the Clarity Data Export API — a design change from the planned MCP route, explained in §3.

---

## 1. Module Map

One row per `architecture.md` §1 directory. "Depends on" is compile-time/import dependency, not runtime call order (that's §3 below).

| Module | Path | Responsibility | Depends on |
| :--- | :--- | :--- | :--- |
| Config loader | `src/config/` | Parses `.env` via `node:util` `parseArgs` + a thin schema check; exposes a typed `Config` object. Fails fast on a missing required var (API key for the configured `PRIMARY_AUTO_CODER`, `GITHUB_TOKEN`, `DATA_DIR`; optional `CLARITY_API_TOKEN`). | — (leaf) |
| Interfaces | `src/core/interfaces/` | `agent-interface.ts`, `tool-interface.ts`, `memory-interface.ts` — pure types/abstract classes, no logic. | — (leaf) |
| Event bus | `src/core/event-bus.ts` | Typed pub/sub (`EventEmitter` subclass or a ~30-line typed wrapper — no external dependency). Event catalog in §4 below. | Interfaces |
| Registry | `src/core/registry.ts` | Dynamic component discovery/DI: adapters and plugins register by string key, resolved at runtime by config (`PRIMARY_AUTO_CODER=claude` → resolves `anthropic-adapter.ts`). | Interfaces |
| Engine | `src/core/engine.ts` | The orchestration state machine: track lifecycle from intake through Guard 3. One state machine instance per track, not a singleton. | Registry, Event bus |
| Anthropic/Gemini/Kimi/DeepSeek adapters | `src/adapters/*.ts` | Each implements `agent-interface.ts`'s contract: `dispatch(task, sessionId) -> AsyncIterable<AgentEvent>`. Headless CLI subprocess (Claude Code) or HTTP API client (others), session-resumable. | Interfaces, Event bus |
| Memory service | `src/services/memory-service/` | Backend-agnostic client implementing `memory-interface.ts`; `KNOWLEDGE_BACKEND` selects `loadstonenexus-backend.ts` (default) or `obsidian-backend.ts` (§2.2). Every write goes through `persist_knowledge`/`persist_decision`/`persist_guard_document` — no direct `$DATA_DIR`/vault file I/O from any other module. | Interfaces, `data-access/mcp-client.ts` |
| Planning service | `src/services/planning-service/` | Hanoi Rainbow SDD engine: generates `intent.md`/`spec.md`/`design.md`/`plan.md` into `flight-deck/tracks/<track_id>/`. Calls memory service to persist each on write. | Memory service |
| Log service | `src/services/log-service/` | **Not built** (no phase has claimed it; `incident-monitor` workers idle until it exists). Sentry/CloudWatch/SigNoz webhook ingestion, PII regex scrubbing, exception dedup (hash of stack signature), archetype pre-triage. | Event bus |
| Monitor service | `src/services/monitor-service/` | CI/CD verification (test runner, build check), `metrics-calculator.ts` (§2.5 — Cycle Time/Evidence Completeness/Rollback Rate), opt-in post-Guard-3 deploy + auto-rollback. Behavioral monitoring lives in `plugins/agents/behavior-monitor.ts` (§2.6 / Phase 7). **Not built:** Slack/Discord/WhatsApp/Email gateway dispatch — the `SLACK_WEBHOOK_URL`-family config is parsed and shown on AMP Mesh/Configuration, but nothing sends. | Event bus, Adapters |
| Fleet DB | `src/services/agent-service/fleet-db.ts` | `bun:sqlite` wrapper. Schema in §4. Instance-local only — never touched by memory-service. | — (leaf) |
| Named process supervisor | `src/services/agent-service/supervisor.ts` | Spawns/monitors named worker child processes, heartbeat, auto-restart, rate-limit hold-and-resume (reads Fleet DB). | Fleet DB, Event bus |
| Watcher/reasoning/planning/execution agents | `src/plugins/agents/*.ts` | Archetype-facing plugin agents: the 4 Relay pipeline agents, plus long-running monitors (`issue-monitor.ts`, and `behavior-monitor.ts` for Clarity behavioral telemetry). | Engine, Planning service, Adapters, `data-access/mcp-client.ts` |
| Git/GitHub/Sentry/code-exec tools | `src/plugins/tools/*.ts` | Each implements `tool-interface.ts`. `git-tool` wraps worktree create/commit/push, plus release tagging (`dd-mm-yyyy-<short SHA>` tag + `changelogs/change-log-<tag>.md` commit, `architecture.md` §10); `github-tool` wraps issue/PR/comment API calls and issue creation (`create_issue` for behavioral anomalies); `code-exec-tool` runs the project's own test/build command. | Interfaces |
| Graph/session memory | `src/plugins/memory/*.ts` | `graph-memory.ts` shells out to `codegraph` CLI (static-parser fallback if absent) and the local Graft stdio MCP server; `session-memory.ts` is the LodestarMemory decision journal writer (calls memory-service). | Memory service |
| Dashboard | `src/dashboard/` | Bun HTTP server + SSE, serves the 16 screens from `screen-list.md` as server-rendered HTML + vanilla JS (matches `mock-ui.html` 1:1 — see §5). Internal layout in §1a. | Event bus (SSE feed), Fleet DB, Memory service |
| CLI | `src/cli/index.ts` | `run` / `daemon` / `dashboard` / `init-knowledge` / `sentinel-test` / `status` / `worker` subcommands per `skills/lodestar/SKILL.md`. | Everything above |

---

## 1a. Layered Refinement, Naming & Dependency Rules

The module map above is `architecture.md` §1's tree as-is. This section refines it — mainly inside `src/dashboard/`, which is the one module big enough (13 features) to need its own internal separation — without renaming or moving anything §1 already defined.

### Directory layout (refined)
```
src/
├── config/                    # unchanged (§1) — leaf, no business logic
├── core/                      # unchanged (§1) — interfaces, event-bus, engine, registry
├── adapters/                  # unchanged (§1) — one file per model provider
├── plugins/{agents,tools,memory}/   # unchanged (§1) — agents include issue-monitor.ts & behavior-monitor.ts
├── services/{memory,planning,log,monitor,agent}-service/  # unchanged (§1) — domain/business logic
├── data-access/                # NEW — thin IO clients services call; no business logic lives here
│   ├── github-client.ts         # NOT BUILT — github-tool.ts still owns its HTTP calls directly
│   ├── mcp-client.ts            # hand-rolled JSON-RPC 2.0 stdio transport (node:readline/child_process) — no @modelcontextprotocol/sdk, used by the LoadstoneNexus `remote` backend
│   ├── clarity-client.ts        # Clarity Data Export API GET (behavior-monitor's telemetry source)
│   └── fleet-db-client.ts       # raw bun:sqlite queries (fleet-db.ts wraps this with domain methods)
├── shared/                     # NEW — feature-agnostic, no upward dependency on features/ or services/
│   ├── ui/                      # server-rendered layout partials: sidebar, topbar, card/table/badge components
│   ├── utils/                   # date/hash formatting (release tag builder), retry/backoff, id generation
│   └── types/                   # cross-cutting types not owned by one interface (e.g. Track, Repo)
├── state/                       # NEW — process-local runtime state, not a domain store
│   └── sse-hub.ts               # tracks connected dashboard clients, fans out event-bus events to them
├── dashboard/
│   ├── server.ts                 # Bun.serve() bootstrap + route table only — no business logic
│   └── features/                 # one folder per screen-list.md screen
│       ├── stats/                 # My Stats + Per-Repo Stats (screen-list.md §1, §1b)
│       │   ├── ui/                 # HTML templates for this screen only
│       │   ├── use-cases/           # e.g. get-org-stats.ts, get-repo-stats.ts — call services/, never data-access/ directly
│       │   └── stats.test.ts
│       ├── relay-pipeline/          # §2
│       ├── fleet/                   # §3
│       ├── amp-mesh/                # §4
│       ├── knowledge/               # §5
│       ├── memories/                # §6
│       ├── history/                 # §7
│       ├── releases/                # §7b (tracker) + §7c (create) — one feature, two routes
│       ├── agents-log/              # §8
│       ├── setup/                   # §9
│       └── configuration/           # §9b
└── cli/index.ts                # unchanged (§1)
```

### Dependency direction (enforced, not aspirational)
`features/<x>/ui` → `features/<x>/use-cases` → `services/*` → `data-access/*` / `adapters/*`. Never the reverse, and never skip a layer (a `ui/` file must not import `data-access/` directly). `shared/` and `core/` have no dependents-only edges pointing *up* into `features/` or `services/` — they're leaves everything else imports, not importers themselves. No feature imports another feature's `use-cases/` or `ui/` directly; cross-feature communication goes through `core/event-bus.ts` (e.g. `releases/` reacting to a `track.shipped` event from `history/`'s domain, not importing `history/` code).

### "Hooks", "state management", "presentation" — mapped, not invented
This is a server-rendered Bun app, not React, so a few requested concepts map onto what already exists rather than getting a literal new folder:
- **Hooks** → `core/event-bus.ts`'s `on(eventType, handler)` subscriptions. Any module that needs to react to a lifecycle event (Guard signed, rate limit hit, PR opened) subscribes there — that's the hook point.
- **State management** → three explicit stores, never conflated: **Fleet DB** (`services/agent-service/fleet-db.ts`, instance-local job/worker state), **knowledge backend** (`services/memory-service/`, project knowledge/Guard docs — LoadstoneNexus or Obsidian), **SSE hub** (`state/sse-hub.ts`, ephemeral per-connection dashboard state, never persisted).
- **Presentation/UI** → `dashboard/features/*/ui/` (per-screen) + `shared/ui/` (cross-screen chrome: sidebar, topbar, card/table primitives — matches `mock-ui.html`'s shared CSS classes like `.card`, `.badge-pill`, `.worker-table`).
- **Application services/use-cases** → `dashboard/features/*/use-cases/` — thin orchestration (fetch + shape data for one screen), not where business rules live.
- **Business logic/domain** → `services/*`, `core/engine.ts` — Guard triage, archetype assignment, rate-limit hold logic, metrics calculation. Use-cases call this; they don't reimplement it.
- **Infrastructure** → repo-root `deploy/` (systemd unit, cloud-init, `Dockerfile` — `deployment.md`), not under `src/` — these are ops artifacts, not TypeScript modules.

### Naming
kebab-case filenames (`anthropic-adapter.ts`, `github-client.ts`); PascalCase types/interfaces; camelCase functions/variables; `SCREAMING_SNAKE_CASE` env vars (`.env.example`); one export focus per file (a file named `get-repo-stats.ts` exports `getRepoStats`, not a grab-bag).

### Comments
Default to none. When a comment is warranted (a non-obvious business rule, a workaround, a decision that would surprise a reader), **max 3 lines**, explaining *why*, never *what* — the code already says what. Applies to all `.ts`/`.tsx` source; doesn't apply to `.md` docs, and never strip a required license header or a tool directive (e.g. `// eslint-disable`, `@ts-expect-error` with its reason).

### Tests
Unit and integration tests are co-located: `<name>.test.ts` next to the file it tests (`fleet-db.ts` + `fleet-db.test.ts`, `stats/use-cases/get-org-stats.ts` + `get-org-stats.test.ts`). Use `bun test`'s built-in runner — no separate framework. **E2E** tests (spin up the daemon/dashboard against a real disposable GitHub repo, per §5's testing strategy) live in a top-level `e2e/` — they exercise multiple features at once and don't belong to any single one.

---

## 2. Core Data Contracts

Define these once, first — every module above imports from here rather than re-declaring shapes.

### 2.1 Fleet DB schema (`bun:sqlite`, instance-local, never LoadstoneNexus)
```sql
CREATE TABLE workers (
  name TEXT PRIMARY KEY,          -- 'agent-casbin-alpha' or 'worker-1'
  job TEXT NOT NULL,               -- incident-monitor | issue-monitor | codebase-monitor | instrumentation-campaign | behavior-monitor
  provider TEXT NOT NULL,          -- claude | gemini | kimi | deepseek | openai
  state TEXT NOT NULL,             -- idle | running | paused_rate_limited | restarting | crashed
  pid INTEGER, rss_mb INTEGER, cpu_pct REAL,
  worktree TEXT,                   -- '<repo>#<track_id>' or NULL
  last_heartbeat INTEGER           -- unix epoch seconds
);
CREATE TABLE rate_limit_holds (
  worker_name TEXT NOT NULL REFERENCES workers(name),
  track_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  resume_at INTEGER NOT NULL       -- unix epoch seconds; provider's reset time, or now+6h if unknown
);
```

### 2.2 Knowledge backend contract (`src/core/interfaces/memory-interface.ts`)
```ts
interface KnowledgeBackend {
  persist_knowledge(collection: string, doc: Record<string, unknown>): Promise<{ id: string }>
  retrieve_knowledge(collection: string, query?: Record<string, unknown>): Promise<unknown[]>
  persist_decision(trackId: string, quote: string, tags: string[]): Promise<void>
  persist_guard_document(trackId: string, kind: 'intent'|'spec'|'design'|'plan'|'evidence', content: string): Promise<void>
  retrieve_guard_document(trackId: string, kind?: string): Promise<{ kind: string; content: string; signedBy?: string }[]>
}
```
Every other module calls this interface, never a concrete backend. `KNOWLEDGE_BACKEND` picks which implementation `registry.ts` resolves to:
- **`loadstonenexus`** (default, `src/services/memory-service/loadstonenexus-backend.ts`): `LOADSTONENEXUS_MCP_MODE=local` runs the MCP server in-process (stdio) against `DATA_DIR`; `remote` makes it a thin HTTP client against `LOADSTONENEXUS_MCP_URL`.
- **`obsidian`** (`src/services/memory-service/obsidian-backend.ts`): writes/reads notes under `OBSIDIAN_VAULT_PATH`, one folder per `collection` argument (e.g. `guard-documents/<track_id>/intent.md`), via HTTP calls to the Local REST API plugin at `OBSIDIAN_MCP_URL` (`OBSIDIAN_API_KEY` auth) — Obsidian itself has no MCP server, so this backend is the MCP-shaped wrapper around that plugin's REST API.

Either backend, the interface and call sites are identical — swapping `KNOWLEDGE_BACKEND` never touches `planning-service`, the dashboard, or the dev-journal writer.

### 2.3 Event bus catalog (`src/core/event-bus.ts`)
```ts
type AgentEvent =
  | { type: 'track.opened'; trackId: string; archetype: 'A'|'B'|'C'|'H'; jobType: string }
  | { type: 'guard.signed'; trackId: string; guard: 1|2|3; signedBy: string }
  | { type: 'guard.rejected'; trackId: string; guard: 3 }
  | { type: 'pipeline.stage'; trackId: string; stage: 'relay-implementer'|'relay-stop-slop'|'relay-reviewer'|'relay-auditor'; verdict?: 'PASS'|'FAIL'|'REVIEW_PASS'|'BLOCK' }
  | { type: 'rate_limit.hit'; workerName: string; provider: string; resumeAt: number }
  | { type: 'rate_limit.resumed'; workerName: string }
  | { type: 'pr.opened'|'pr.updated'; trackId: string; repo: string; prUrl: string }
  | { type: 'track.shipped'; trackId: string; repo: string; cycleTimeMs: number; evidenceCount: number; lead: string }
  | { type: 'track.deployed'; trackId: string; repo: string; deployedAt: number }
  | { type: 'deploy.rollback'; trackId: string; repo: string; reason: string; revertedCommit: string }
  | { type: 'worker.heartbeat'; workerName: string; rssMb: number; cpuPct: number }
  | { type: 'behavior.anomaly_detected'; repo: string; frictionType: 'rage_clicks'|'dead_clicks'|'excessive_scroll'|'quick_backs'|'js_exceptions'; url: string; selector?: string; metrics: Record<string, number> }
  | { type: 'behavior.issue_created'; repo: string; issueNumber: number; issueUrl: string; frictionType: string };
```
Dashboard SSE and Agents Log both subscribe to this bus — neither polls the Fleet DB or LoadstoneNexus directly on a timer.

### 2.4 Track directory layout (`flight-deck/tracks/<track_id>/`)
```
flight-deck/tracks/<track_id>/
  intent.md          # Guard 1 — Analyst-certified (or C/H-bypassed)
  spec.md
  design.md
  plan.md             # Guard 2 — agent self-signed (or human, on a gated path)
  guard-evidence.md   # Guard 3 — Lead-certified
  evidence.json       # machine-readable mirror of guard-evidence.md
```
Every file here is written locally in the worktree first, then persisted to LoadstoneNexus via `persist_guard_document` on the same write — the local file is never the only copy once a stage completes (`architecture.md` §6 point 6).

### 2.5 Operational Metrics & Calculation Engine (`src/services/monitor-service/metrics-calculator.ts`)
Calculates Cycle Time, Evidence Package Completeness, Lead SLA, and Rollback Rates:

```ts
export interface TrackTimestamps {
  intakeAt: number;        // ms epoch when /intake-routing allocated track
  routedAt?: number;       // ms epoch when archetype classification finished
  guard1At?: number;       // ms epoch when Analyst certified intent.md
  guard2At?: number;       // ms epoch when Engineer signed plan.md
  buildPassAt?: number;    // ms epoch when relay-stop-slop returned PASS
  verifyPassAt?: number;   // ms epoch when relay-reviewer / SAST returned PASS
  evidenceGenAt?: number;  // ms epoch when relay-auditor compiled evidence pack
  guard3At: number;        // ms epoch when Lead certified guard-evidence.md
  deployedAt?: number;     // ms epoch when opt-in deployment completed
}

export interface CycleTimeBreakdown {
  totalCycleTimeMs: number;        // guard3At (or deployedAt) - intakeAt
  totalCycleTimeMinutes: number;   // totalCycleTimeMs / 60,000
  stageLatencies: {
    intakeMinutes: number;         // (routedAt - intakeAt) / 60,000
    shapeMinutes: number;          // (guard1At - routedAt) / 60,000
    planMinutes: number;           // (guard2At - guard1At) / 60,000
    buildMinutes: number;          // (buildPassAt - guard2At) / 60,000
    verifyMinutes: number;         // (verifyPassAt - buildPassAt) / 60,000
    leadSignMinutes: number;       // (guard3At - evidenceGenAt) / 60,000
    deployMinutes: number;         // (deployedAt - guard3At) / 60,000
  };
}

export function calculateCycleTime(ts: TrackTimestamps): CycleTimeBreakdown {
  const finalTimestamp = ts.deployedAt || ts.guard3At;
  const totalMs = finalTimestamp - ts.intakeAt;
  return {
    totalCycleTimeMs: totalMs,
    totalCycleTimeMinutes: Math.round((totalMs / 60000) * 10) / 10,
    stageLatencies: {
      intakeMinutes: Math.max(0, Math.round(((ts.routedAt || ts.intakeAt) - ts.intakeAt) / 60000)),
      shapeMinutes: Math.max(0, Math.round(((ts.guard1At || ts.intakeAt) - (ts.routedAt || ts.intakeAt)) / 60000)),
      planMinutes: Math.max(0, Math.round(((ts.guard2At || ts.guard1At || ts.intakeAt) - (ts.guard1At || ts.intakeAt)) / 60000)),
      buildMinutes: Math.max(0, Math.round(((ts.buildPassAt || ts.guard2At || ts.intakeAt) - (ts.guard2At || ts.intakeAt)) / 60000)),
      verifyMinutes: Math.max(0, Math.round(((ts.verifyPassAt || ts.buildPassAt || ts.intakeAt) - (ts.buildPassAt || ts.intakeAt)) / 60000)),
      leadSignMinutes: Math.max(0, Math.round((ts.guard3At - (ts.evidenceGenAt || ts.verifyPassAt || ts.intakeAt)) / 60000)),
      deployMinutes: ts.deployedAt ? Math.max(0, Math.round((ts.deployedAt - ts.guard3At) / 60000)) : 0
    }
  };
}

export interface EvidenceValidationResult {
  trackId: string;
  totalArtifacts: number;         // Must equal exactly 5
  validArtifacts: number;
  completenessPercent: number;    // (validArtifacts / 5) * 100
  artifacts: {
    intent: boolean;
    spec: boolean;
    design: boolean;
    plan: boolean;
    evidencePack: boolean;        // guard-evidence.md + evidence.json
  };
  sha256Verified: boolean;
  leadSignatureValid: boolean;
}

export interface PostDeployTelemetry {
  trackId: string;
  repo: string;
  deployedAt: number;
  observationWindowEnd: number;   // deployedAt + 30m
  healthCheckFails: number;       // Consecutive probe failures
  sentryErrorSpikeCount: number;  // New unhandled exception count
  baselineErrorRate: number;      // Pre-deploy baseline
  currentErrorRate: number;       // Post-deploy error rate
}

export function evaluateRollbackCondition(metrics: PostDeployTelemetry): { shouldRollback: boolean; reason?: string } {
  if (metrics.healthCheckFails >= 3) {
    return { shouldRollback: true, reason: 'Health check probe failed 3 consecutive attempts post-deploy.' };
  }
  if (metrics.currentErrorRate > Math.max(1.0, metrics.baselineErrorRate * 3)) {
    return { shouldRollback: true, reason: `Error rate spike detected: ${metrics.currentErrorRate}% exceeds baseline threshold.` };
  }
  return { shouldRollback: false };
}
```

### 2.6 Microsoft Clarity Behavioral MCP & Issue Generation Contract (`src/plugins/agents/behavior-monitor.ts`)

Connects Lodestar to the [Clarity Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api) via `src/data-access/clarity-client.ts` (originally planned via the Clarity MCP server — see the Phase 7 design-change note in §3) to ingest real-user behavioral friction telemetry from [Microsoft Clarity](https://github.com/microsoft/clarity). When user experience anomalies exceed thresholds, `behavior-monitor` synthesizes evidence-backed issues and files them directly to GitHub via `github-tool.ts` (`create_issue` action).

#### Anomaly Detection & Telemetry Shape
```ts
export interface ClarityFrustrationSignal {
  frictionType: 'rage_clicks' | 'dead_clicks' | 'excessive_scroll' | 'quick_backs' | 'js_exceptions';
  url: string;                     // Impacted page route, e.g. '/checkout'
  selector?: string;                // Target element CSS selector, e.g. 'button#complete-purchase'
  sessionCount: number;             // Total affected user sessions
  eventCount: number;               // Total friction occurrences
  frustrationScore: number;         // 0.0 - 1.0 composite friction index
  replayUrls: string[];             // Direct Microsoft Clarity session replay URLs
  deviceBreakdown?: Record<string, number>; // e.g. { mobile: 74, desktop: 26 }
  browserBreakdown?: Record<string, number>;
  errorMessage?: string;            // Relevant client-side error string if js_exceptions
}

export interface ClarityThresholdConfig {
  minRageClicks?: number;           // Default: 20 occurrences/window
  minDeadClicks?: number;           // Default: 30 occurrences/window
  minJsExceptions?: number;         // Default: 15 exceptions/window
  minFrustrationScore?: number;     // Default: 0.65
  lookbackHours?: number;           // Default: 24 (Clarity export window)
}
```

#### Fingerprint Deduplication
To prevent duplicate GitHub issues during ongoing frustration spikes, the monitor derives a deterministic fingerprint:
```ts
export function behavioralFingerprint(repo: string, signal: ClarityFrustrationSignal): string {
  const normSelector = (signal.selector || 'page').toLowerCase().replace(/\s+/g, '');
  const normUrl = signal.url.split('?')[0].toLowerCase();
  return `behavior_${repo}_${signal.frictionType}_${normUrl}_${normSelector}`;
}
```
Before opening an issue, `behavior-monitor` queries open issues via `github-tool.ts` (`list_issues` with label `behavior`) and checks for an existing fingerprint marker in the issue body (or local Fleet DB state). If present, it skips creating a duplicate.

#### Autonomous GitHub Issue Structure
The generated issue provides immediate, actionable context for engineers or Lodestar's `issue-monitor`:
- **Title**: `[UX Friction: <FrictionType>] <Target Element / Selector> on <Page Path>` (e.g. `[UX Friction: Rage Clicks] button#pay-now on /checkout`)
- **Labels**: `['behavior', 'clarity', 'ux-friction', 'triage']`
- **Body Markdown**:
```markdown
### 🚨 User Behavior Anomaly Detected (Microsoft Clarity)

- **Repository**: `<owner/repo>`
- **Friction Type**: `<rage_clicks | dead_clicks | excessive_scroll | js_exceptions>`
- **Impacted Route**: `<page url path>`
- **Target DOM Selector**: `<css selector>`
- **Impact Severity**: `<eventCount> occurrences across <sessionCount> user sessions (Frustration Score: <score>)`
- **Device Breakdown**: `<mobile % / desktop %>`

#### 📹 Session Replay Evidence
- [View Session Replay in Microsoft Clarity](<replayUrl>)

#### 🔍 Hypothesized Cause & Diagnostics
<LLM-derived or rule-based hypothesis: unresponsive click handler, button disabled without visual cue, layout shift, or uncaught exception>

#### 🎯 Recommended Action
- **Suggested SDD Archetype**: `B` (Brownfield UX improvement) or `C` (bounded JS bugfix)
- Issue fingerprint: `<!-- fingerprint: <fingerprint> -->`
```

---

## 3. Build Order

Seven phases, matching `plan.md` §5's gantt plus the Microsoft Clarity behavioral monitor extension, decomposed to file-level tasks. Each phase lists a **done-when** check — the smallest thing that proves the phase works, per the repo's own testing convention (one runnable check per non-trivial unit, no framework).

### Phase 0 — Config & Interfaces (prerequisite for everything) — **Done**
- `src/config/index.ts`: load `.env`, validate required vars for the configured `PRIMARY_AUTO_CODER`.
- `src/core/interfaces/{agent,tool,memory}-interface.ts`.
- `src/core/event-bus.ts` with the catalog in §2.3.
- **Done when**: `bun run src/config/index.ts` with a deliberately incomplete `.env` exits non-zero with a clear "missing X" message; a unit test publishes one event and asserts one subscriber receives it.

### Phase 1 — Single-provider, single-repo happy path (no Guards yet) — **Done**
- `src/adapters/anthropic-adapter.ts` (Claude Code CLI headless runner — the only adapter needed to prove the path end-to-end).
- `src/plugins/tools/{git,github,code-exec}-tool.ts`.
- `src/core/engine.ts` (minimal: intake → build → PR, no archetype triage, no Guards).
- `src/cli/index.ts run --issue <N> --repo <owner/repo>`.
- **Done when**: pointed at a real throwaway GitHub repo with one labeled issue, `run` opens a PR with a passing test, end to end, no human step.

### Phase 2 — Knowledge & Memory — **Done**
- `src/plugins/memory/graph-memory.ts` (CodeGraph shell-out + static-parser fallback).
- `src/services/memory-service/` — `loadstonenexus-backend.ts` first (`local` mode only), then `obsidian-backend.ts` once the interface has proven stable against one real backend.
- `src/plugins/memory/session-memory.ts` (LodestarMemory decision journal).
- **Done when**: `init-knowledge` populates `$DATA_DIR/knowledge`, and a second run of the same command reuses the cache (no re-index) — the dashboard's Knowledge screen (§5) can read it back via `retrieve_knowledge`.

### Phase 3 — Hanoi Rainbow SDD + Relay Guard 1/2/3 — **Done**
- `src/services/planning-service/` generating `intent.md`/`spec.md`/`design.md`/`plan.md` into `flight-deck/tracks/<track_id>/`, each persisted via `persist_guard_document` on write.
- Guard 1/2/3 state machine in `engine.ts`: archetype triage (A/B/C/H), `TEAM_MODE` solo/team branching, `ALLOW_AUTONOMOUS_INCIDENT_DECLARATION` gate.
- **Done when**: the same Phase 1 issue now produces `intent.md` requiring a signature before build starts (solo mode: same CLI user signs via a `--sign-guard-1` flag or an interactive prompt), and `guard-evidence.md`/`evidence.json` before the PR opens.

### Phase 4 — Multi-model + 4-agent pipeline — **Done**
- `src/adapters/{gemini,kimi,deepseek}-adapter.ts` — HTTP-based, registered in `cli/index.ts` when their `*_API_KEY` is present; Kimi/DeepSeek share `openai-compatible-adapter.ts` (both are OpenAI-compatible chat/completions streams, so one base class instead of two near-duplicate files). `run --provider <name>` (or `PRIMARY_AUTO_CODER`) resolves through `registry.getAgent()` and logs the chosen provider before dispatch.
- `src/plugins/agents/{relay-implementer,relay-stop-slop,relay-reviewer,relay-auditor}.ts` — `engine.ts`'s build/verify/ship steps now call these instead of running inline (Known Gap #5's decisions, below, made this buildable):
  - `relay-implementer`/`relay-reviewer`/`relay-auditor` are direct extractions of the prior inline logic (dispatch-and-collect, test-command run, evidence generation) — same behavior, just named and independently testable.
  - `relay-stop-slop` is new: dispatches an LLM-judged scan prompt (checks for the slop patterns in this repo's own coding conventions — dead code, speculative abstractions, broad exception swallowing, narrating comments) to `config.relayStopSlopProvider`'s adapter, requires a `VERDICT: PASS`/`VERDICT: FAIL` marker in the response, and **defaults to FAIL** if the marker is missing rather than silently passing. Runs after `relay-implementer`, gates `relay-reviewer` — a FAIL stops the track before tests run, matching `architecture.md`'s "PASS required before advancing." Its verdict/reasons flow into `relay-auditor`'s evidence package (`generateEvidence`'s new optional `stopSlop` param).
- **Done when**: `AGENT_1_PROVIDER=deepseek` in `.env` actually dispatches that agent's tasks to DeepSeek's API, verified by a log line naming the provider, not just Claude every time. *(Met via `--provider deepseek` / `PRIMARY_AUTO_CODER=deepseek`, not literally `AGENT_1_PROVIDER` — that var stays Phase 5 fleet-worker config per Known Gap #5's resolution.)*

### Phase 5 — Rate-Limit Sentinel + Fleet — **Done**
- `src/data-access/fleet-db-client.ts` + `src/services/agent-service/fleet-db.ts` (schema in §2.1) and `supervisor.ts` (spawn/heartbeat via IPC/auto-restart/rate-limit hold-and-resume, all DI-testable with a fake `spawn`).
- `src/cli/index.ts worker` (one job-type's polling loop — only `issue-monitor` is functional, via `src/plugins/agents/issue-monitor.ts`'s `pollIssueMonitor`/`runIssueMonitorLoop`; other job types idle with heartbeat-only, honest about not being built yet) and `daemon` (spawns one worker per `GITHUB_REPO` × `fleetAgents` pair via `Supervisor`, periodic `checkAndResumeHolds`).
- Track resumability: `engine.ts` now checks for an existing `plan.md` before regenerating Guard 1/2 docs, so a respawned worker re-polling the same repo resumes the same track (keyed by a deterministic `track_<repo>_<issue>` id from `issue-monitor.ts`) instead of re-doing already-certified stages.
- Also fixed in passing: `AGENT_COUNT=0` was silently falling back to the default of 3 (`parseInt(...) || 3` treats a real `0` as falsy) — `fleetAgents` parsing depends on this being correct.
- **Done when**: killing a worker process mid-task, the supervisor respawns it and it resumes the same track from its last-known state, and a simulated 429 produces a Fleet DB hold row that auto-clears at `resume_at`. *(Respawn-and-resume and the hold/auto-clear cycle are both unit-tested with a fake child process and `FleetDb(':memory:')`; not yet exercised against a real killed OS process.)*

### Phase 5b — Metrics Engine + Opt-in Deploy & Rollback — **Done**
- `src/services/monitor-service/metrics-calculator.ts` (§2.5, predates this plan) already had `calculateCycleTime`, `validateEvidencePackage`, `evaluateRollbackCondition`. What was missing and is now built: `metrics-service.ts`'s `MetricsService` — subscribes to `guard.signed`/`track.shipped`/`track.deployed`/`deploy.rollback` on construction (not polled), keeps a live per-track metric map plus `getAverageCycleTimeMs()`/`getRollbackRatePercent()`/`getGuardSignCount(n)`. Not yet wired into the Phase-6 `/stats` screen (that screen currently derives its numbers from `track-reader.ts`'s on-disk scan instead, which is restart-safe where an in-memory event subscriber isn't) — hooking `MetricsService` into the dashboard for live SSE-pushed updates is Phase 6 work, not 5b's.
- Opt-in deploy: `workflow-config.ts` parses `flight-deck/workflow.md`'s `Deploy:`/`Rollback:` lines (no file = opt-out, the default); `deploy-runner.ts`'s `runOptInDeploy` runs the declared command post-ship and emits `track.deployed`, `performRollback` runs `git revert -m 1 <commit_hash>` (new `git-tool.ts` `revert` action) + the declared `Rollback:` command, emits `deploy.rollback`, then calls `engine.executeTrack` with `archetype: 'H'` for the remediation track — all wired into `engine.ts` right after `track.shipped` fires. `evaluateRollbackCondition` (already existed) is what decides *whether* to roll back; nothing in this codebase produces real post-deploy telemetry yet (no health-check prober, no Sentry/CloudWatch feed), so that decision needs a telemetry input from somewhere until one exists.
- New `lodestar deploy-test` CLI command supplies that telemetry as an explicit simulation (mirroring the existing `sentinel-test` pattern): creates an isolated worktree (never touches the real working tree), makes a throwaway commit, feeds `evaluateRollbackCondition` a simulated 3-failed-health-checks telemetry object, and on the resulting "should rollback" verdict runs the real `performRollback` end-to-end — real `git revert`, real `deploy.rollback` event, a real archetype-H track through the real engine (worktree, adapter dispatch, stop-slop, PR attempt).
- **Done when**: a simulated post-deploy health-check failure triggers an automatic revert and a new H track, end to end, without a human step. *(`lodestar deploy-test` does exactly this; verified via `deploy-runner.test.ts`'s fakes plus a real CLI invocation in this sandbox, which fails at the worktree-creation step for the mundane reason that this repo itself has no `.git` — the mechanism is proven, a real git repo is the only thing this sandbox can't supply.)* My Stats' Cycle Time/Evidence Completeness numbers come from real event timestamps, not mock data — true today via `track-reader.ts`; `MetricsService` is the event-driven alternative path for when Phase 6 wants live updates instead of a disk re-scan per request.

### Phase 6 — Dashboard (all 16 screens, `screen-list.md` §0/§1–9d) — **Done**
- Foundation: `src/shared/ui/styles.ts` (CSS extracted from `mock-ui.html`'s `<style>` block) + `layout.ts` (`renderLayout()` — sidebar/topbar shell, nav matching `screen-list.md`'s routes, optional real nav badges, a signed-in-user chip + dropdown with real session/role info, and admin-only nav items hidden for non-admin roles via `NavItem.adminOnly`); `src/state/sse-hub.ts` (fans out `EventBus` activity to subscribed clients — built but not yet consumed by any screen, live-update SSE wiring is still open); `src/dashboard/dashboard-deps.ts` (the one `DashboardDeps` bag); `src/dashboard/server.ts` (route table, every route wired for real, session auth on all of them via `validateUserSession`).
- Shared real-data backbone this phase needed and didn't have: `src/services/monitor-service/track-reader.ts`'s `listTracks()` — scans `flight-deck/tracks/*/{intent,plan}.md` + `evidence.json` on disk into `TrackRecord[]`. Backs Stats, Repos Stats, Relay, History, Memories — no event-bus polling needed, Guard docs are already the durable on-disk record per `architecture.md` §6.
- Small real backend additions made in support of specific screens: `git-tool.ts` gained `list_tags` and `head_sha` (Release Tracker §7b / Create Release §7c) and reused `release_tag`; `Config` gained the six `SLACK_WEBHOOK_URL`-family gateway fields (needed by AMP Mesh §4 and Configuration §9b) and `analystName`/`leadName` are now surfaced on Configuration §9b (shown only when `TEAM_MODE=team`, matching how they're actually used).
- **Login (§0) + Users Registry (§9d, admin-only, new this pass)**: the session-login system that appeared mid-phase is now formally specced. Closed real gaps against that spec: `AuthDb`'s schema/seed now actually load from `src/data-access/sql/{users,user_insert}.sql` at runtime (they existed as files the code duplicated inline before, which would have made the Users Registry's "Raw SQL Seed & Migration Explorer" show decorative, disconnected content); added `AuthDb.listSessions()` / `AuthService.listSessions()`+`revokeSession()` (real session ledger + instant revocation, per §9d); added the login page's 1-click Quick-Fill credential buttons (§0); and added the RBAC gate itself — `/users` and `/users/revoke-session` now 403 for any non-`admin` role (this was completely unenforced before — any authenticated user could reach the registry). The registry screen (users table, add-operator form wired to the real `AuthService.createUser`, sessions ledger with real revoke, real metric cards) is otherwise real end-to-end, no mock data.
- **Monitor Setup (§9c, new this pass)**: real repo checkboxes (`config.githubRepos`) and a real count of `instrumentation-campaign`-job fleet agents; the campaign form and "Run this change" trigger are honestly inert — Instrumentation Campaign fan-out is deferred scope (`architecture.md` §6/§7, this doc's own Deferred list below) and building real execution here would mean building that deferred feature, not a dashboard screen.
- Found and fixed in passing, same bug class as the `AGENT_COUNT=0` fix in Phase 5: `PORT=0` (used throughout this test suite to mean "let the OS pick a free port," e.g. every `createDashboardServer` test) was silently becoming `3000` (`parseInt('0',10) || 3000` — a real `0` is falsy) — every dashboard test server was actually binding real port 3000, a live `EADDRINUSE` risk between parallel/sequential test runs. Fixed the same way: `Number.isFinite` instead of `||`.
- Every screen reads a real source; where none exists, it says so instead of borrowing the mock's numbers. Recurring categories: **(a)** MCP-call/token/spend tracking — no instrumentation anywhere (Stats' 3 cards); **(b)** live worker stdout/stderr — supervisor captures heartbeat via IPC only (Fleet's log-split panel); **(c)** decision/ADR persistence — `persist_decision` has no real caller yet (Memories); **(d)** dev-journal entries — real and queryable, but nothing in the real track-execution flow calls `SessionMemory.persistDevJournal` yet, so Agents Log is real-but-usually-empty; **(e)** per-stage timestamp audit trail — no stage-audit log persists to disk (Relay); **(f)** PR links / gateway-delivery tracking / $-savings pricing / campaign execution — no subsystem anywhere (History, Monitor Setup). AMP Mesh's peer graph is real too, just necessarily a single node — multi-machine mesh is deferred scope, not missing.
- `e2e/dashboard.test.ts` (top-level `e2e/`, `bun test` auto-discovers it): boots the real `createDashboardServer`, logs in as the seeded `admin`/`admin` user, walks every `NAV_ITEMS` route asserting 200 + correct active-nav-item + no leftover placeholder markup, seeds one real track and confirms it surfaces on `/memories`, checks the user popover, and confirms logout revokes the session. 257 tests total (241 unit/integration + a growing e2e suite).
- **Done when**: every screen in `screen-list.md` renders from `src/dashboard/`, and a manual smoke pass shows real data instead of the mock's hardcoded numbers. *(Met — verified via `e2e/dashboard.test.ts` plus a manual curl+Playwright pass over every route in this sandbox, including RBAC: 403 for a `developer` session hitting `/users`, 200 for `admin`.)*

### Phase 7 — Microsoft Clarity Behavioral Integration & User Behavior Monitor Agent — **Built; live Clarity run pending**
> **Design change (2026-11-11):** the original plan routed Clarity through `@microsoft/clarity-mcp-server`. Its v2 tools (`query-analytics-dashboard`, `list-session-recordings`, `query-documentation-resources`) take natural-language queries or return session samples with an undocumented shape — no per-URL friction counts to threshold deterministically, and the planned `get_frustration_metrics` tool never existed. `behavior-monitor` now calls the documented [Clarity Data Export API](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api) (`project-live-insights`, `dimension1=URL`) directly via `src/data-access/clarity-client.ts`, using the same Data Export token. `CLARITY_PROJECT_ID`/`CLARITY_MCP_MODE`/`CLARITY_MCP_URL` were removed.
- `src/plugins/tools/github-tool.ts`: Add `create_issue` action (POST `/repos/{owner}/{repo}/issues` with `title`, `body`, `labels`), enabling Lodestar agents to programmatically file structured issues on GitHub. Covered by unit tests in `src/plugins/tools/github-tool.test.ts`. `list_issues` also takes `state` (`open`/`closed`/`all`) and paginates (100/page, 10-page cap).
- `src/config/index.ts` & `.env.example`: `CLARITY_API_TOKEN` plus thresholds `CLARITY_MIN_RAGE_CLICKS`, `CLARITY_MIN_DEAD_CLICKS`, `CLARITY_MIN_JS_EXCEPTIONS`, `CLARITY_MIN_QUICK_BACKS`, `CLARITY_MIN_EXCESSIVE_SCROLL`, `CLARITY_MIN_FRUSTRATION_SCORE`, `CLARITY_LOOKBACK_HOURS` (rounded up to Data Export's 1–3 day window), `CLARITY_BATCH_INTERVAL_HOURS`.
- `src/data-access/clarity-client.ts`: one GET per batch to `project-live-insights` with `Authorization: Bearer <token>`; non-2xx (401/403/429) throws with the status, never returns an empty result.
- `src/plugins/agents/behavior-monitor.ts`: Implement `pollBehaviorMonitor(deps: BehaviorMonitorDeps)` and `runBehaviorMonitorLoop(deps, opts)`. Each batch maps the `RageClickCount`/`DeadClickCount`/`QuickbackClick`/`ExcessiveScroll`/`ScriptErrorCount` metric rows into `ClarityFrustrationSignal`s (`mapClarityInsightsToSignals`):
  - Evaluates frustration signals against configured thresholds (rage clicks, dead clicks, quick backs, excessive scroll, JavaScript error clusters); the frustration-score shortcut needs ≥10 affected sessions so one visit to a quiet page can't file an issue.
  - Computes deterministic fingerprint (`behavioralFingerprint`) and checks existing GitHub issues — open **and closed** — via `github-tool.ts` (`list_issues` with label `behavior`, `state: 'all'`) to prevent duplicate issues for identical routes/selectors. If that lookup fails, the batch is skipped rather than risking duplicates.
  - Synthesizes evidence-backed issue body including impacted CSS selectors, user friction metrics, direct Clarity session replay URLs, and recommended Hanoi Rainbow archetype (`B` for brownfield UX friction, `C` for clear JS bugfix).
  - Calls `githubTool.execute({ action: 'create_issue', ... })` and emits `behavior.anomaly_detected` and `behavior.issue_created` events.
- `src/cli/index.ts`: Add `behavior-monitor` to `--job` choices in `lodestar worker` subcommand; wire into `Supervisor` daemon loop for workers configured with `job: 'behavior-monitor'`.
- Dashboard visibility: Surface `behavior-monitor` in My Fleet worker job dropdowns (`docs/mock-ui.html` / `dashboard/features/fleet/`) and Configuration screen (§9b).
- **Done when**: Pointed at a configured repo and Clarity project (or test mock MCP server), `lodestar worker --job behavior-monitor` retrieves a behavioral anomaly, derives the fingerprint, verifies no duplicate issue exists, and successfully creates an issue on GitHub with labels `['behavior', 'clarity', 'ux-friction']`, selector details, and direct session replay links. A subsequent poll with the same anomaly detects the fingerprint and safely skips issue creation.
- **Status**: *Met against a faked Data Export response* (`behavior-monitor.test.ts`: metric-row mapping, lookback→`numOfDays`, 429 surfaced as an error, threshold + session floor, closed-issue dedup, fail-closed when the issue list is unavailable, loop survives a failed batch; `github-tool.test.ts` covers `create_issue` and pagination). `worker --job behavior-monitor` exits non-zero without `CLARITY_API_TOKEN`; each batch logs its counts or its failure. Fleet/Configuration screens render the job from config, so `behavior-monitor` workers show up without UI changes. **Still open:**
  1. Not yet run against a real Clarity project. Microsoft's docs only sample the `Traffic` metric; the friction-row field names (`subTotal`, `sessionsCount`, `sessionsWithMetricPercentage`, `URL`) come from observed responses and need confirming against a live token.
  2. The Data Export API has no element dimension or session IDs, so issues carry the URL but no CSS selector and no replay links (the body says so). Selector-level detail would need a second source, e.g. Clarity's MCP `list-session-recordings`, once its response shape is pinned down.
  3. Closed issues block re-filing permanently, so a regression on the same URL/friction type after a fix isn't re-reported. Acceptable for now (no spam); revisit with a time window if needed.

### Deferred (per `architecture.md` §6/§7 — don't build speculatively)
- SigNoz/OpenTelemetry wiring — only once the fleet is actually multi-machine.
- measure-sh — only if a mobile-client repo joins the fleet.
- Multi-machine AMP peer mesh — opt-in scale-out, single-instance is the default target.
- Instrumentation Campaign fan-out (§9's Level 4 diagram) — build after Phase 5's single-repo fan-out works; it's the same mechanism with a different Discovery step (bulk API scan vs. single-symbol lookup), not a separate pipeline.

---

## 4. Dashboard Parity Requirement

`mock-ui.html` is the executable spec for `src/dashboard/`, not just a mood board. Phase 6 is "done" per-screen only when:
1. The route exists at the path in `screen-list.md` (e.g. `/repos`, `/config`).
2. Every UI component listed for that screen in `screen-list.md` is present and wired to a real data source per §2 above (no hardcoded numbers left over from the mock).
3. Nav, tabs, and cross-screen links (Guard docs → Memories, Configuration → Skill Setup, etc.) behave the same as the mock's existing JS.

---

## 5. Testing Strategy

- **Per-module**: one `assert`-based `demo()`/`test_*.ts` per non-trivial file (branch, loop, parser, or a money/security-adjacent path — Guard signing counts). No test framework/fixtures beyond `bun test`'s built-in runner.
- **Per-phase**: the "done when" check above, run manually or wired into `bun test` as an integration test once Phase 1 exists (needs a real disposable GitHub repo — don't mock GitHub's API for this one, per the project's own "integration tests hit the real thing" bias).
- **Gated paths** (PII/auth/authz/audit-logging): Opengrep SAST run required in CI before merge, no exceptions — this is Relay's own rule (`architecture.md` §1), not optional for Lodestar's own repo either once it has code.

---

## 6. Known Gaps — Decide Before/During Implementation

These surfaced during the doc review and need a decision, not just a doc fix:

1. ~~Two competing spec-directory conventions.~~ **Resolved.** `flight-deck/tracks/<track_id>/` is canonical for all Hanoi Rainbow SDD and Relay Baton artifacts (`intent.md`, `spec.md`, `design.md`, `plan.md`, `guard-evidence.md`, `evidence.json`). `skills/lodestar/SKILL.md`, `docs/deployment.md`, and configs have been updated to use `flight-deck/tracks/`, and the vestigial `RAINBOW_SPECS_DIR` has been removed.
2. ~~`ANALYST_NAME`/`LEAD_NAME` have no dashboard surface yet.~~ **Resolved.** `ANALYST_NAME` and `LEAD_NAME` are added to the Configuration screen (§9b) under `TEAM_MODE` (and parsed into `Config`), establishing the human gate signers for team mode:
   - **Gate 1 (Guard 1 — Intent Certification)**: When Gate 1 finishes shaping (`intent.md`), a PR is opened on GitHub with the initial SDD docs and mirrored to the knowledge backend (LoadstoneNexus / Obsidian MCP). In `TEAM_MODE=team`, the PR waits for approval from the named **Analyst** (`ANALYST_NAME`) before build proceeds.
   - **Gate 2 (Guard 2 — Plan Approval)**: The LLM Engineer self-signs `plan.md` (no extra human approval wait required unless on a gated path), commits the plan to the PR branch, syncs to MCP, and moves directly into implementation and testing.
   - **Gate 3 (Guard 3 — Evidence Certification)**: Generates `guard-evidence.md` + `evidence.json`, commits all artifacts to the PR branch, syncs them to LoadstoneNexus/Obsidian MCP, and waits for final approval from the named **Lead** (`LEAD_NAME`). Once certified, the PR is merged.
3. ~~OpenAI's role is ambiguous.~~ **Resolved.** OpenAI is promoted to a full 5th model provider implemented via `src/adapters/openai-adapter.ts` (extending `OpenAiCompatibleAdapter`), wired into `cli/index.ts`, tested in `openai-adapter.test.ts`, and supported across `PRIMARY_AUTO_CODER`, `FALLBACK_AUTO_CODERS`, `RELAY_STOP_SLOP_PROVIDER`, and per-agent fleet workers (`AGENT_N_PROVIDER`).
4. ~~Instrumentation Campaign fan-out's per-repo archetype rule is underspecified.~~ **Resolved.** Multi-repo campaigns are removed from the per-track Relay pipeline and relocated to a dedicated control plane screen (**Screen 9c: Monitor Setup & Multi-Repo Campaigns**). Users toggle campaign status (Enabled/Disabled) on top, select the target repositories via checkbox grid, configure the transform definition/pattern, and execute via the "Run this change" action. Each child track runs as a bounded archetype C transform with automated PR creation per selected repository.
5. ~~No config surface for per-pipeline-stage providers, and `relay-stop-slop` is unspecified.~~ **Resolved.** `architecture.md`'s "each of the 4 pipeline agents can be bound to a different provider" turned out to only matter for 2 of the 4 stages: `relay-reviewer` (runs the test command) and `relay-auditor` (writes the evidence package) are deterministic, no LLM call, so no provider config needed. `relay-implementer` already had one (`TrackConfig.provider` / `PRIMARY_AUTO_CODER`). That left one real gap — `relay-stop-slop` — closed with a single new optional var, `RELAY_STOP_SLOP_PROVIDER` (`.env.example`, `Config.relayStopSlopProvider`, defaults to `PRIMARY_AUTO_CODER`), not the 4-var `AGENT_N_PROVIDER`-shaped scheme `architecture.md`'s example implied (that naming stays reserved for Phase 5 fleet workers — don't reuse it here). `relay-stop-slop`'s behavior: an LLM-judged scan (see §3 Phase 4) rather than a deterministic linter, since "scans for slop" per `architecture.md` §1 has no fixed rule set to encode.
6. Clarity Data Export API quotas, lookback retention, and issue spam prevention. **Resolved.** The official Microsoft Clarity Data Export API typically retains user telemetry for 1–3 days and enforces query quotas (e.g. ~10 API export calls/project/day). The `behavior-monitor` agent operates on a configurable scheduled batch cadence defaulting to **4 hours** (`CLARITY_BATCH_INTERVAL_HOURS=4`, limiting consumption to ~6 API calls/day, safely within the ~10 calls/day export quota), and enforces deterministic fingerprint deduplication (`behavioralFingerprint` checking open issues with label `behavior` or Fleet DB state) to prevent filing duplicate issues for recurring UX friction points.
