# Lodestar: Production Deployment Guide

> **Comprehensive Deployment Guide & Infrastructure Automation for Autonomous Development Agents**  
> Covers **Cloud VM Provisioning**, **Docker / Container Deployment**, **systemd Service Automation**, and **GitHub Actions CI**.

> Replace every `<your-fork>` placeholder with your actual fork before using any command here.

---

### 1. Automated Development VM Requirements

To run an autonomous coding agent 24/7 that monitors GitHub issues, runs **CodeGraph** AST indexing, executes **Claude Code / Gemini / Kimi / DeepSeek**, and sleeps during rate-limit refresh windows, the deployment host must meet the requirements aligned with your codebase ecosystem and monitoring density:

### 1.1 Baseline Requirements by Workload Profile

| Workload Profile & Language Ecosystem | Minimum | Recommended | High Monitoring Agent Fleet / Massive Monorepo |
| :--- | :--- | :--- | :--- |
| **Web & Backend** *(TS, Node, Python, Go)* | 2 vCPUs / 4 GB RAM | 4 vCPUs / 8–16 GB RAM | 8 vCPUs / 16 GB RAM |
| **Android & JVM** *(Kotlin, Java, Gradle)* | 4 vCPUs / 8 GB RAM | 8 vCPUs / 16–32 GB RAM | 16 vCPUs / 32–64 GB RAM |
| **iOS Native** *(Swift, SPM, Xcodebuild)* | 4 vCPUs / 8 GB (Linux Agent) | 8 vCPUs / 16 GB (Linux Agent)<br>+ `mac2.metal` (Xcode tests) | 16 vCPUs / 32 GB (Linux Agent)<br>+ `mac2.metal` (Xcode tests) |
| **Storage (NVMe SSD gp3)** | 50 GB (3,000 IOPS) | 100–250 GB (6,000 IOPS) | 500 GB+ (12,000 IOPS) |
| **Data Nexus Path** | `$DATA_DIR` (e.g. `/opt/LoadstoneNexus` on a remote VM, or local EFS) |
| **Operating System** | Ubuntu 24.04 LTS (Linux x86_64 / ARM64 Graviton) |
| **Network** | 100 Mbps, Outbound HTTPS | 1 Gbps, Outbound HTTPS | 10 Gbps, Outbound HTTPS |

*Rationale:*
- **Android / JVM Memory Footprint**: The Gradle daemon ($2.5\text{–}4.0\text{ GB}$ heap), Kotlin compiler / KAPT / KSP processing ($2.0\text{–}4.0\text{ GB}$), and Android Lint tests consume significant memory per concurrent worker.
- **iOS & Xcode Architecture**: Code analysis, Hanoi SDD, and review run fast on Linux ARM64 instances, while native Xcode simulator / XCTest passes dispatch to dedicated bare-metal macOS runners (`mac2.metal`).
- **High Monitoring Continuous Agent**: Continuous 24/7 Sentry exception ingestion, SigNoz trace anomaly processing, real-time incremental CodeGraph AST re-indexing upon every merged commit, and 30-minute auto-rollback health probes require dedicated CPU and RAM headroom.
- **LoadstoneNexus Central Storage**: Project knowledge and Gate documents (AST caches, LodestarMemory banks, decision journals, spec/plan/evidence artifacts) are persisted to the path set by `DATA_DIR` in `.env`, behind a LoadstoneNexus MCP server (`persist_knowledge`/`retrieve_knowledge`) rather than read/written directly by every service — see `architecture.md` §3 Level 2. Set `DATA_DIR` to a path that exists on your deployment host — don't copy another machine's path verbatim. Job/fleet operational state (PID, RSS, heartbeat, hold schedules) is separate — it lives in the local Fleet DB (SQLite), not under `DATA_DIR`.
- **Single-Instance 2 GB Repo Budget & Phase 2 Multi-Node Roadmap**: On a single-instance deployment (Phase 1), each active repository worker is budgeted for **$\le 2.0\text{ GB}$ RSS runtime memory**. Repositories exceeding $>2\text{ GB}$ runtime memory (e.g. heavy Gradle daemons, massive monorepos, iOS simulator suites) should be partitioned into a **Phase 2 Multi-Node Distributed Fleet** with dedicated compute and mobile runner nodes — see `docs/phase2.md`.
- **Worktree cleanup keeps storage bounded**: each track checks out a full repo copy into `.worktrees/<track_id>/`, but the worker deletes it once Guard 3 certifies and the PR is opened/updated (`architecture.md` §6, point 6).

---

## 2. Cloud VM Provider Comparison & Selection

| Provider | Workload / Language Tier | Instance Type | Specs | Est. Cost / Mo | Pros / Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AWS EC2** *(Top Enterprise)* | **High Monitoring / Android / Fleet** | **`c7g.2xlarge`** / **`m7g.2xlarge`** (ARM) | 8 vCPU / 16–32 GB RAM / 250 GB EBS | **~$148 / mo** | Enterprise IAM roles, VPC isolation, automatic EBS snapshots, and native Graviton3 efficiency. |
| **AWS EC2** | **Standard Web / Solo** | **`t4g.xlarge`** (ARM) | 4 vCPU / 16 GB RAM / 100 GB EBS | **~$72 / mo** | Cost-effective for 2-4 concurrent workers on TypeScript/Go/Python repositories. |
| **Hetzner Cloud** | **Standard Web / Budget** | **CPX31** / **CPX41** | 4–8 vCPU / 8–16 GB RAM / 160–240 GB SSD | **~$15 – $30 / mo** | High performance-to-price ratio for persistent background daemons. |
| **DigitalOcean** | **Standard Team** | **General Purpose Droplet** | 4 vCPU / 16 GB RAM / 100 GB SSD | **~$80 / mo** | 1-click snapshots, simple UI, excellent global data center coverage. |
| **AWS EC2 Mac** | **iOS Native Build Host** | **`mac2.metal`** (M1 Apple Silicon) | 12 vCPU / 32 GB RAM / 500 GB EBS | **~$450 / mo** | Dedicated physical macOS node for full native Xcodebuild and iOS simulator testing. |
| **Local VM** | **Local Testing** | **Multipass / Lima / OrbStack** | 8 vCPU / 16 GB RAM (Host allocated) | **$0 / mo** | Isolated local Ubuntu VM on macOS for zero-cost testing. |

---

### 3. Turnkey VM Setup (One-Command Automation)

### Option 3.1: Automated Shell Script (`deploy/setup-vm.sh`)
On a freshly created Ubuntu 24.04 server, run this single command as `root` or `sudo` — **read the script first**; piping an unreviewed remote script into `bash` as root is risky even when the URL is your own fork:

```bash
curl -fsSL https://raw.githubusercontent.com/<your-fork>/lodestar/main/deploy/setup-vm.sh -o setup-vm.sh
less setup-vm.sh   # review before running
sudo bash setup-vm.sh
```

Or manually:
```bash
# 1. Clone repository (replace with your fork's URL)
git clone https://github.com/<your-fork>/lodestar.git /opt/lodestar
cd /opt/lodestar

# 2. Run automated setup script
chmod +x deploy/setup-vm.sh
sudo ./deploy/setup-vm.sh
```

The script automatically:
1. Updates `apt` packages and installs `git`, `curl`, `build-essential`, `unzip`.
2. Installs the official **GitHub CLI (`gh`)**.
3. Installs **Bun** (`curl -fsSL https://bun.sh/install | bash`).
4. Installs **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`).
5. Installs **CodeGraph CLI** (`npm install -g @colbymchenry/codegraph`).
6. Configures a production `systemd` daemon (`/etc/systemd/system/lodestar.service`) with auto-restart on crash.

---

### Option 3.2: Cloud-Init Automated Provisioning (`deploy/cloud-init.yaml`)
When creating a VPS on Hetzner, DigitalOcean, or AWS EC2, paste the content into the **User Data / Cloud-Init** field.

```yaml
#cloud-config
package_update: true
package_upgrade: true
packages:
  - git
  - curl
  - unzip
  - build-essential
  - jq

runcmd:
  # Install GitHub CLI
  - curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  - chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  - apt-get update && apt-get install -y gh

  # Install Bun
  - curl -fsSL https://bun.sh/install | bash
  - ln -s /root/.bun/bin/bun /usr/local/bin/bun

  # Install Node & CLIs
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - apt-get install -y nodejs
  - npm install -g @anthropic-ai/claude-code @colbymchenry/codegraph

  # Setup Lodestar directory
  - mkdir -p /opt/lodestar
```

---

## 4. Production `systemd` Service (`lodestar.service`)

To run Lodestar continuously as a managed background service:

Create `/etc/systemd/system/lodestar.service`:
```ini
[Unit]
Description=Lodestar Autonomous GitHub Issue Resolver
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/lodestar
EnvironmentFile=/opt/lodestar/.env
ExecStart=/usr/local/bin/bun run src/cli/index.ts daemon --interval 60
Restart=always
RestartSec=15
StandardOutput=append:/var/log/lodestar.log
StandardError=append:/var/log/lodestar-error.log

# Resource limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable lodestar
sudo systemctl start lodestar

# Check live logs
journalctl -u lodestar -f
```

---

## 5. Docker & Containerized Deployment

For container-native environments (Docker, Kubernetes, AWS ECS, Fly.io).

### 5.1 Dockerfile
```dockerfile
FROM oven/bun:1.4-debian

# Install Git, GitHub CLI, and Node runtime
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    build-essential \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code @colbymchenry/codegraph \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY templates ./templates

# Expose persistent data volume
VOLUME ["/app/.lodestar/knowledge", "/app/.codegraph", "/app/flight-deck"]

ENTRYPOINT ["bun", "run", "src/cli/index.ts"]
CMD ["daemon", "--interval", "60"]
```

### 5.2 docker-compose.yml
```yaml
version: '3.8'

services:
  lodestar:
    build: .
    container_name: lodestar-runner
    restart: unless-stopped
    ports:
      - "3000:3000" # Auto-Monitor Dashboard Web UI
    env_file:
      - .env
    volumes:
      - ./knowledge:/app/.lodestar/knowledge
      - ./codegraph:/app/.codegraph
      - ./flight-deck:/app/flight-deck
      - /var/run/docker.sock:/var/run/docker.sock
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
```

Start the container:
```bash
docker compose up -d
docker compose logs -f
```

---

## 6. GitHub Actions CI Deployment (Event-Driven Cloud)

If you prefer not to manage any VMs, deploy Lodestar directly inside **GitHub Actions**:

Create `.github/workflows/lodestar.yml`:
```yaml
name: Lodestar Autonomous Issue Resolver

on:
  issues:
    types: [labeled, opened]

jobs:
  resolve-issue:
    if: contains(github.event.issue.labels.*.name, 'agent-todo')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - name: Checkout Target Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Bun Environment
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0

      - name: Setup Node.js & Tooling
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Claude Code & CodeGraph
        run: |
          npm install -g @anthropic-ai/claude-code @colbymchenry/codegraph

      - name: Run Lodestar on Issue
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPO: ${{ github.repository }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          KIMI_API_KEY: ${{ secrets.KIMI_API_KEY }}
          PRIMARY_AUTO_CODER: claude
          FALLBACK_AUTO_CODERS: gemini,kimi
          AUTO_WAIT_ON_RATE_LIMIT: "true"
        run: |
          bun run /path/to/lodestar/src/cli/index.ts run --issue ${{ github.event.issue.number }}
```

---

## 7. Environment Secret Management

All connection properties are managed via the root `.env` file:

```bash
# Generate configuration from template
cp .env.example .env
chmod 600 .env
```

Ensure the following variables are set:
- `GITHUB_TOKEN`: Classic PAT with `repo` scope, or fine-grained token with Issues, Pull Requests, and Contents read/write.
- `GITHUB_REPO`: Comma-separated `owner/repo` list for the `run`/`daemon` commands (e.g. `apache/casbin-gateway,org/hanoi-rainbow`). The poller fans out across every listed repo from one daemon (`plan.md` §6) — set the full list per deployment, don't hardcode a personal repo in shared config.
- `ISSUE_LABEL_FILTER`: Label the `daemon` poller filters on (default `agent-todo`).
- `DATA_DIR`: Absolute path for persistent knowledge/metrics storage on *this* host — set per deployment, never copy another machine's path.
- Organizational gateways (all optional, each independently connected): `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `WHATSAPP_API_TOKEN`/`WHATSAPP_BROADCAST_LIST`, `SMTP_URL`/`ALERT_EMAIL_TO`. Every run's outcome broadcasts to whichever of these are set — see `screen-list.md` §7's Notified column.
- `ANTHROPIC_API_KEY`: Required for Claude Code.
- `GEMINI_API_KEY`: Required for Google Gemini 2.5 Pro fallback.
- `KIMI_API_KEY`: Required for Moonshot Kimi fallback.

**Log-monitoring source URLs**: `function-diagram.md` describes a Guard 1 ingestion layer pulling from Sentry / CloudWatch / Logtail / SigNoz, in addition to GitHub issues (`GITHUB_REPO` + `ISSUE_LABEL_FILTER`). Its source URLs/credentials belong here as `SENTRY_DSN`, `CLOUDWATCH_LOG_GROUP`, or similar.

**Per-agent fleet config**: `architecture.md` §7 describes a configurable agent count with per-agent model provider and job assignment, overriding the global `PRIMARY_AUTO_CODER`/`FALLBACK_AUTO_CODERS` pair. The shape:
```bash
TEAM_MODE=solo                     # solo (default) or team — see architecture.md §1's Team size mode
# ANALYST_NAME= / LEAD_NAME=        # required only if TEAM_MODE=team; the two humans who sign Guard 1 / Guard 3
ALLOW_AUTONOMOUS_INCIDENT_DECLARATION=false   # off by default, matches Relay's rule — set true to let monitoring declare Sev-0/Sev-1 itself
AGENT_COUNT=3
AGENT_1_PROVIDER=claude
AGENT_1_JOB=incident-monitor      # app/log & incident monitor
AGENT_2_PROVIDER=deepseek
AGENT_2_JOB=issue-monitor          # GitHub issue monitor (SDD, intent/spec approval required)
AGENT_3_PROVIDER=claude
AGENT_3_JOB=codebase-monitor        # commit/deploy watcher, re-indexes knowledge, updates existing PRs
DEEPSEEK_API_KEY=
```
`TEAM_MODE=solo` means the same person self-signs both Guard 1 and Guard 3 — a pause-and-review checkpoint, not an independence check. Switch to `TEAM_MODE=team` only once there's an actual separate Analyst and Lead to name; don't set it for a solo setup just because the config exists.

`ALLOW_AUTONOMOUS_INCIDENT_DECLARATION` is the one setting that relaxes an actual Relay safety rule — leave it `false` unless you specifically want unattended Sev-0/Sev-1 response while nobody's watching, and understand the tradeoff (`architecture.md` §1) before flipping it. Neither this nor `TEAM_MODE` removes Guard 1 or Guard 3 from the pipeline — both guards always run, on every archetype.

Job assignment is also meant to be changeable live from the dashboard's My Fleet screen (`screen-list.md` §3), not just here — these env vars are the deployment-time default, not the only way to set it.

**SigNoz / OpenTelemetry configuration** — deferred until the fleet is actually multi-machine (`architecture.md` §6):
```bash
OTEL_SERVICE_NAME=lodestar
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # SigNoz OTLP/HTTP receiver
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1                          # 10% sampling — full tracing is rarely needed for this volume
SIGNOZ_UI_PORT=3301                                  # SigNoz UI's own default port, separate from Lodestar's :3000 dashboard
```
Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your SigNoz collector (self-hosted alongside Lodestar, or a shared collector if you already run one for other services) — don't stand up a second collector per Lodestar instance.

**One-click install** — use the official install script for a quick standalone deployment:
```bash
git clone -b main https://github.com/SigNoz/signoz.git
cd signoz/deploy/
./install.sh
```
SigNoz UI is now at `:3301`, and it's already listening on the OTLP ports `OTEL_EXPORTER_OTLP_ENDPOINT` above points at.

**measure-sh configuration — self-hosted (OSS), not Measure Cloud** — only relevant if a mobile-client repo joins the fleet (`architecture.md` §6); Lodestar reads *from* Measure as a Guard 1 ingestion source, the same way it reads from Sentry:

```bash
MEASURE_ENDPOINT=https://measure-api.yourcompany.com   # your self-hosted install's API URL, not Measure Cloud
MEASURE_API_KEY=
MEASURE_APP_ID=                                          # the mobile app registered in Measure this repo corresponds to
```

**One-click install** (from the `measure-sh/measure` repo's `self-host/` directory):
```bash
git clone https://github.com/measure-sh/measure.git && cd measure/self-host && sudo ./install.sh
```
Add `--podman` instead of Docker if that's your runtime. One command, but not silent — `install.sh` is a wizard: prompts for your namespace, Dashboard/API/Ingest URLs, Google + GitHub OAuth credentials, and an SMTP provider, then writes everything to `self-host/.env`. Brings up Postgres, ClickHouse, a symbolicator (for iOS crash symbolication), and a Caddy reverse proxy on ports 80/443.

**Two things that don't fit on Lodestar's single EC2 instance**, if this ever gets activated:
- **Port collision**: Measure's own dashboard defaults to **:3000** — the same port Lodestar's dashboard uses. Run Measure on a separate host, or remap one of the two.
- **Resource sizing**: Measure's self-host minimum is **4 vCPU / 16 GB RAM / 100 GB disk** — heavier than Lodestar's own single-instance baseline (§1: 2 vCPU / 4 GB minimum). Give it its own instance rather than co-locating on Lodestar's box; don't just add mobile-app monitoring to an existing small VM and expect it to fit.

Leave all three `MEASURE_*` vars unset until a mobile-client repo actually exists — an empty `MEASURE_APP_ID` means this ingestion source is simply never polled.

---

## 8. Health Monitoring & Log Management

### Monitoring Daemon Status:
```bash
# Inspect process status
systemctl status lodestar

# Check Lodestar Sentinel state
bun run src/cli/index.ts status

# Tail logs
tail -f /var/log/lodestar.log
```

### Log Rotation (`/etc/logrotate.d/lodestar`):
```ini
/var/log/lodestar*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
}
```
