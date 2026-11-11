# Lodestar Installation & Deployment Guide

> **Step-by-Step Setup Guide for Local Workstations, Agent Harnesses, and Production Cloud VMs**

---

## 1. Prerequisites

Before installing Lodestar, ensure your environment meets the following requirements:

| Dependency | Minimum Version | Installation / Verification |
| :--- | :--- | :--- |
| **Bun** | $\ge 1.1.0$ (1.4+ recommended) | `curl -fsSL https://bun.sh/install \| bash` |
| **Git** | $\ge 2.38.0$ (worktree support) | `git --version` |
| **GitHub Access** | Personal Access Token or App | Classic token with `repo` scope or Fine-Grained token |
| **Opengrep** *(Optional)* | Latest | `brew install opengrep` or `pip install opengrep` |
| **Model API Keys** | At least 1 provider | Anthropic, Google Gemini, Moonshot Kimi, DeepSeek, or OpenAI |

---

## 2. Local Workstation Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/lodestar-ai/lodestar.git
cd lodestar
```

### Step 2: Install Dependencies
Lodestar uses native Bun TypeScript execution with zero external runtime package bloat:
```bash
bun install
```

### Step 3: Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Edit `.env` with your preferred editor and provide at minimum your GitHub credentials and primary LLM API key:
```bash
# Core GitHub Configuration
GITHUB_TOKEN=ghp_yourPersonalAccessTokenHere
GITHUB_REPO=your-org/your-repo
GITHUB_BASE_BRANCH=main
ISSUE_LABEL_FILTER=agent-todo

# Primary Model Provider
PRIMARY_AUTO_CODER=claude
FALLBACK_AUTO_CODERS=gemini,kimi,deepseek

# API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=AIzaSy...

# Dashboard & Fleet Settings
DASHBOARD_PORT=3000
AGENT_COUNT=4
TEAM_MODE=solo
```

### Step 4: Verify Installation & Sanity Check
Run the status check subcommand:
```bash
bun run src/cli/index.ts status
```
You should see a clean configuration report confirming that model keys, GitHub access, and local SQLite databases are ready.

---

## 3. Environment Variable Configuration Reference

### 3.1 Relay & Team Settings
- `TEAM_MODE`: `solo` (automated self-signing for single vibecoder) or `team` (enforces explicit human signatures for Analyst and Lead).
- `ANALYST_NAME`: Designated name for Guard 1 certification (team mode).
- `LEAD_NAME`: Designated name for Guard 3 evidence certification (team mode).
- `ALLOW_AUTONOMOUS_INCIDENT_DECLARATION`: Set to `true` to allow telemetry alarms to trigger Archetype H hotfix tracks automatically.

### 3.2 GitHub Integration
- `GITHUB_TOKEN`: GitHub Personal Access Token or App Installation Token.
- `GITHUB_REPO`: Target repository (`owner/repo`) or comma-separated list of multi-repos (`org/repo-a,org/repo-b`).
- `GITHUB_BASE_BRANCH`: Default branch target (e.g. `main` or `master`).
- `ISSUE_LABEL_FILTER`: Label required on issues for autonomous daemon pickup (e.g. `agent-todo`).

### 3.3 Multi-Model Providers
- `PRIMARY_AUTO_CODER`: `claude` | `gemini` | `kimi` | `deepseek` | `openai`.
- `FALLBACK_AUTO_CODERS`: Comma-separated list of fallback providers during outages or rate-limit saturation.
- Per-provider keys and model overrides:
  - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default: `claude-3-7-sonnet-20250219`)
  - `GEMINI_API_KEY`, `GEMINI_MODEL` (default: `gemini-2.5-pro`)
  - `KIMI_API_KEY`, `KIMI_MODEL` (default: `moonshot-v1-32k`)
  - `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default: `deepseek-chat`)
  - `OPENAI_API_KEY`, `OPENAI_MODEL` (default: `gpt-4o`)

### 3.4 Knowledge Backend Configuration
- `KNOWLEDGE_BACKEND`: `loadstonenexus` (default) or `obsidian`.
- **LoadstoneNexus Settings**:
  - `DATA_DIR`: Path to persistent markdown store (default: `./flight-deck/knowledge`).
  - `LOADSTONENEXUS_MCP_MODE`: `stdio` (default) or `http`.
- **Obsidian Settings**:
  - `OBSIDIAN_VAULT_PATH`: Local absolute path to your Obsidian vault.
  - `OBSIDIAN_API_KEY`: API token if using Local REST API plugin.

### 3.5 Alerting & Gateways
- `SLACK_WEBHOOK_URL`: Incoming webhook URL for Slack alerts.
- `DISCORD_WEBHOOK_URL`: Discord webhook URL.
- `WHATSAPP_API_TOKEN`, `WHATSAPP_BROADCAST_LIST`: Cloud API credentials for WhatsApp incident alerts.
- `SMTP_URL`, `ALERT_EMAIL_TO`: SMTP connection string and destination for email reports.

---

## 4. Installing Lodestar as an Agent Skill

Lodestar provides an installable Agent Skill definition compatible with Claude Code, Gemini CLI, OpenCode, and Antigravity:

```bash
# If using Claude Code / Antigravity skills CLI:
skill install lodestar
```
Or symlink the skill directory into your active agent config:
```bash
mkdir -p ~/.agents/skills/
ln -s "$(pwd)/skills/lodestar" ~/.agents/skills/lodestar
```

---

## 5. Initializing Knowledge Graphs

Before processing code tasks, index your repository's structure into your knowledge backend:

```bash
bun run src/cli/index.ts init-knowledge
```
This executes CodeGraph AST indexing and Graft MCP repo-mapping, storing the structural map in `$DATA_DIR/knowledge` for fast, zero-network agent retrieval.

---

## 6. Production VM Deployment (Systemd / EC2)

For continuous 24/7 operation, deploy Lodestar to a single cloud instance (e.g., AWS EC2 `t3.medium` or `c6g.large`, Ubuntu 22.04 LTS).

### 6.1 Create Dedicated Service Account
```bash
sudo useradd -r -s /bin/bash -d /opt/lodestar lodestar
sudo mkdir -p /opt/lodestar
sudo chown -R lodestar:lodestar /opt/lodestar
```

### 6.2 Setup Code & Environment
```bash
sudo -u lodestar git clone https://github.com/lodestar-ai/lodestar.git /opt/lodestar
cd /opt/lodestar
sudo -u lodestar bun install
sudo -u lodestar cp .env.example .env
# Edit .env with production credentials
```

### 6.3 Install Systemd Unit
Create `/etc/systemd/system/lodestar.service`:
```ini
[Unit]
Description=Lodestar Autonomous Software Factory
After=network.target

[Service]
Type=simple
User=lodestar
Group=lodestar
WorkingDirectory=/opt/lodestar
ExecStart=/home/lodestar/.bun/bin/bun run src/cli/index.ts daemon --interval 60
Restart=always
RestartSec=10
EnvironmentFile=/opt/lodestar/.env

# Security Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/opt/lodestar/flight-deck /opt/lodestar/.worktrees /opt/lodestar/data

[Install]
WantedBy=multi-user.target
```

### 6.4 Enable and Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lodestar
sudo systemctl status lodestar
```

---

## 7. Docker Deployment

Lodestar can be packaged as a container for deployment in Docker, ECS, or Kubernetes environments.

### 7.1 Dockerfile Reference
```dockerfile
FROM oven/bun:1.4-debian

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY flight-deck ./flight-deck

EXPOSE 3000

CMD ["bun", "run", "src/cli/index.ts", "daemon"]
```

### 7.2 Docker Run Command
```bash
docker run -d \
  --name lodestar \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/flight-deck:/app/flight-deck \
  -v $(pwd)/.worktrees:/app/.worktrees \
  lodestar:latest
```

---

## 8. Verification & Smoke Testing

Validate your complete setup by executing the test suite and checking the status dashboard:

```bash
# 1. Run unit test suite (286 tests)
bun test

# 2. Run Sentinel rate-limit simulator
bun run src/cli/index.ts sentinel-test

# 3. Start web dashboard and verify UI loads
bun run src/cli/index.ts dashboard --port 3000
```
Visit `http://localhost:3000` to confirm all 16 operational screens are communicating with the local Fleet DB and event bus.
