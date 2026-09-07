import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  githubToken: string;
  githubRepos: string[];
  issueLabelFilter: string[];
  dataDir: string;
  primaryAutoCoder: 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai';
  fallbackAutoCoders: ('claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai')[];
  anthropicApiKey?: string;
  geminiApiKey?: string;
  kimiApiKey?: string;
  deepseekApiKey?: string;
  openaiApiKey?: string;
  relayStopSlopProvider: 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai';
  knowledgeBackend: 'loadstonenexus' | 'obsidian';
  loadstoneNexusMcpMode: 'local' | 'remote';
  loadstoneNexusMcpUrl?: string;
  obsidianVaultPath?: string;
  obsidianMcpUrl?: string;
  obsidianApiKey?: string;
  port: number;
  teamMode: 'solo' | 'team';
  analystName?: string;
  leadName?: string;
  allowAutonomousIncidentDeclaration: boolean;
  agentCount: number;
  fleetAgents: { name: string; provider: 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai'; job: string }[];
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  whatsappApiToken?: string;
  whatsappBroadcastList: string[];
  smtpUrl?: string;
  alertEmailTo: string[];
}

export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIdx = trimmed.indexOf('=');
    if (equalsIdx <= 0) continue;

    const key = trimmed.slice(0, equalsIdx).trim();
    let val = trimmed.slice(equalsIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function loadConfig(envOverride?: Record<string, string | undefined>): Config {
  const env: Record<string, string | undefined> = { ...process.env };

  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    try {
      const parsed = parseDotEnv(readFileSync(envPath, 'utf-8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (env[k] === undefined) {
          env[k] = v;
        }
      }
    } catch {
      // Ignored if unreadable
    }
  }

  if (envOverride) {
    for (const [k, v] of Object.entries(envOverride)) {
      env[k] = v;
    }
  }

  const githubToken = env.GITHUB_TOKEN?.trim();
  if (!githubToken) {
    throw new Error('Missing required environment variable: GITHUB_TOKEN');
  }

  const dataDir = env.DATA_DIR?.trim() || './data';

  const rawPrimary = (env.PRIMARY_AUTO_CODER?.trim() || 'claude').toLowerCase();
  const validProviders = ['claude', 'gemini', 'kimi', 'deepseek', 'openai'] as const;
  if (!validProviders.includes(rawPrimary as any)) {
    throw new Error(`Invalid PRIMARY_AUTO_CODER: "${rawPrimary}". Expected one of: ${validProviders.join(', ')}`);
  }
  const primaryAutoCoder = rawPrimary as 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai';

  const rawFallbacks = env.FALLBACK_AUTO_CODERS
    ? env.FALLBACK_AUTO_CODERS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const fallbackAutoCoders = rawFallbacks.filter(f => validProviders.includes(f as any)) as ('claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai')[];

  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  const geminiApiKey = env.GEMINI_API_KEY?.trim();
  const kimiApiKey = env.KIMI_API_KEY?.trim();
  const deepseekApiKey = env.DEEPSEEK_API_KEY?.trim();
  const openaiApiKey = env.OPENAI_API_KEY?.trim();

  if (primaryAutoCoder === 'gemini' && !geminiApiKey) {
    throw new Error('Missing required environment variable for PRIMARY_AUTO_CODER=gemini: GEMINI_API_KEY');
  }
  if (primaryAutoCoder === 'kimi' && !kimiApiKey) {
    throw new Error('Missing required environment variable for PRIMARY_AUTO_CODER=kimi: KIMI_API_KEY');
  }
  if (primaryAutoCoder === 'deepseek' && !deepseekApiKey) {
    throw new Error('Missing required environment variable for PRIMARY_AUTO_CODER=deepseek: DEEPSEEK_API_KEY');
  }
  if (primaryAutoCoder === 'openai' && !openaiApiKey) {
    throw new Error('Missing required environment variable for PRIMARY_AUTO_CODER=openai: OPENAI_API_KEY');
  }

  const rawRepos = env.GITHUB_REPO
    ? env.GITHUB_REPO.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  const rawLabels = env.ISSUE_LABEL_FILTER
    ? env.ISSUE_LABEL_FILTER.split(',').map(l => l.trim()).filter(Boolean)
    : ['lodestar', 'bug', 'enhancement'];

  const rawStopSlopProvider = (env.RELAY_STOP_SLOP_PROVIDER?.trim() || primaryAutoCoder).toLowerCase();
  const relayStopSlopProvider = (validProviders.includes(rawStopSlopProvider as any) ? rawStopSlopProvider : primaryAutoCoder) as 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai';

  const knowledgeBackend = (env.KNOWLEDGE_BACKEND?.trim().toLowerCase() === 'obsidian' ? 'obsidian' : 'loadstonenexus') as 'loadstonenexus' | 'obsidian';
  const loadstoneNexusMcpMode = (env.LOADSTONENEXUS_MCP_MODE?.trim().toLowerCase() === 'remote' ? 'remote' : 'local') as 'local' | 'remote';

  const teamMode = (env.TEAM_MODE?.trim().toLowerCase() === 'team' ? 'team' : 'solo') as 'solo' | 'team';
  const analystName = env.ANALYST_NAME?.trim() || undefined;
  const leadName = env.LEAD_NAME?.trim() || undefined;
  const allowAutonomousIncidentDeclaration = env.ALLOW_AUTONOMOUS_INCIDENT_DECLARATION === 'true' || env.ALLOW_AUTONOMOUS_INCIDENT_DECLARATION === '1';

  const parsedPort = env.PORT !== undefined ? parseInt(env.PORT, 10) : NaN;
  const port = Number.isFinite(parsedPort) ? parsedPort : 3000;
  const parsedAgentCount = env.AGENT_COUNT !== undefined ? parseInt(env.AGENT_COUNT, 10) : NaN;
  const agentCount = Number.isFinite(parsedAgentCount) ? parsedAgentCount : 3;

  const fleetAgents: Config['fleetAgents'] = [];
  for (let i = 1; i <= agentCount; i++) {
    const rawAgentProvider = env[`AGENT_${i}_PROVIDER`]?.trim().toLowerCase();
    const job = env[`AGENT_${i}_JOB`]?.trim();
    if (rawAgentProvider && job && validProviders.includes(rawAgentProvider as any)) {
      fleetAgents.push({ name: `agent-${i}`, provider: rawAgentProvider as 'claude' | 'gemini' | 'kimi' | 'deepseek' | 'openai', job });
    }
  }

  return {
    githubToken,
    githubRepos: rawRepos,
    issueLabelFilter: rawLabels,
    dataDir,
    primaryAutoCoder,
    fallbackAutoCoders,
    relayStopSlopProvider,
    anthropicApiKey,
    geminiApiKey,
    kimiApiKey,
    deepseekApiKey,
    openaiApiKey,
    knowledgeBackend,
    loadstoneNexusMcpMode,
    loadstoneNexusMcpUrl: env.LOADSTONENEXUS_MCP_URL,
    obsidianVaultPath: env.OBSIDIAN_VAULT_PATH,
    obsidianMcpUrl: env.OBSIDIAN_MCP_URL,
    obsidianApiKey: env.OBSIDIAN_API_KEY,
    port,
    teamMode,
    analystName,
    leadName,
    allowAutonomousIncidentDeclaration,
    agentCount,
    fleetAgents,
    slackWebhookUrl: env.SLACK_WEBHOOK_URL?.trim() || undefined,
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL?.trim() || undefined,
    whatsappApiToken: env.WHATSAPP_API_TOKEN?.trim() || undefined,
    whatsappBroadcastList: env.WHATSAPP_BROADCAST_LIST
      ? env.WHATSAPP_BROADCAST_LIST.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    smtpUrl: env.SMTP_URL?.trim() || undefined,
    alertEmailTo: env.ALERT_EMAIL_TO
      ? env.ALERT_EMAIL_TO.split(',').map(s => s.trim()).filter(Boolean)
      : [],
  };
}
