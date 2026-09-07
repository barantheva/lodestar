---
name: lodestar
description: >-
  Autonomous Spec-Driven GitHub Issue Resolver and Software Factory.
  Monitors GitHub issues across multiple repositories (e.g. apache/casbin-gateway,
  hanoi-rainbow), builds CodeGraph ASTs and Graft knowledge bases, applies Hanoi
  Rainbow Spec-Driven Development, fixes code with Claude Code, Gemini, or Kimi,
  handles rate-limits with auto-wait sentinel, and opens verified Pull Requests.
---

# Lodestar Skill

Lodestar is an autonomous multi-repository developer agent that resolves GitHub issues end-to-end following **Spec-Driven Development (SDD)** and submits verified Pull Requests.

## When to Use Lodestar

Use this skill whenever you need to:
- Resolve a GitHub issue autonomously with full specification, code changes, and test verification.
- Monitor a GitHub repository for incoming issues (`agent-todo`).
- Manage Claude Code or LLM token limits and 429 quota exhaustion without losing work.
- Build a persistent semantic repository knowledge base using **CodeGraph** and **Graft**.
- Inspect live agent metrics, token consumption, cost, and active runs via the web dashboard.

---

## Core Commands

### 1. Resolve a Specific GitHub Issue
```bash
bun run src/cli/index.ts run --issue <NUMBER> --repo <OWNER/REPO> [--provider claude|gemini|kimi|deepseek]
```
- Fetches issue requirements, triages an archetype, and opens `flight-deck/tracks/<track_id>/`.
- Generates `intent.md` (Guard 1), `spec.md`, `design.md`, `plan.md` (Guard 2) per Relay's SDD stages — see `architecture.md` §1.
- Executes implementation tasks via the chosen provider.
- Automatically handles rate limits (pauses, sleeps, resumes).
- Runs test verification and submits a Pull Request.

### 2. Run Autonomous Continuous Daemon
```bash
bun run src/cli/index.ts daemon --repo <OWNER/REPO> --interval 60 --label agent-todo
```
- Continuously polls the configured repository (`--repo`, or `GITHUB_REPO` in `.env`).
- Reports live status to the web dashboard.

### 3. Start Live Operations Dashboard
```bash
bun run src/cli/index.ts dashboard --port 3000
```
- Opens live web dashboard at `http://localhost:3000`.
- Shows issues monitored/fixed, real-time token ledger ($ cost), runtimes, and rate-limit countdowns.

### 4. Index Repository Knowledge Base
```bash
bun run src/cli/index.ts init-knowledge
```
- Runs `codegraph init` and Graft repo mapper.
- Persists results to LoadstoneNexus MCP (`persist_knowledge`) under `$DATA_DIR/knowledge` — never a local per-repo file, so any worker or dashboard view reads the same knowledge base.

### 5. Check Sentinel & Rate-Limit Diagnostics
```bash
bun run src/cli/index.ts sentinel-test
bun run src/cli/index.ts status
```

---

## Configuration (`.env`)

Configure the target repository and credentials in `.env`:
```bash
GITHUB_TOKEN=ghp_...
GITHUB_REPO=apache/casbin-gateway
PRIMARY_AUTO_CODER=claude
FALLBACK_AUTO_CODERS=gemini,kimi,deepseek
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
KIMI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
AUTO_WAIT_ON_RATE_LIMIT=true
DASHBOARD_PORT=3000
```

> Multi-repo polling (a single daemon fanning out across several repos) and log-source ingestion (Sentry/CloudWatch/SigNoz triggering issues automatically) are on the roadmap — see `plan.md` and `function-diagram.md`. Every issue, incident, or codebase finding this skill resolves goes through Relay's Guard 1 (intent certification) → Guard 2 (plan approval) → Guard 3 (evidence certification) — see `architecture.md` §1 and §8.
