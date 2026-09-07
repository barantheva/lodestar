import type { DashboardDeps } from '../../../dashboard-deps.ts';

export interface ConfigView {
  teamMode: string;
  analystName?: string;
  leadName?: string;
  githubTokenSet: boolean;
  githubRepos: string[];
  agentCount: number;
  fleetAgents: { name: string; provider: string; job: string }[];
  primaryAutoCoder: string;
  providerKeys: { provider: string; set: boolean }[];
  knowledgeBackend: string;
  gateways: { name: string; connected: boolean }[];
}

export function getConfigView(deps: Pick<DashboardDeps, 'config'>): ConfigView {
  const { config } = deps;

  return {
    teamMode: config.teamMode,
    analystName: config.analystName,
    leadName: config.leadName,
    githubTokenSet: !!config.githubToken,
    githubRepos: config.githubRepos,
    agentCount: config.agentCount,
    fleetAgents: config.fleetAgents,
    primaryAutoCoder: config.primaryAutoCoder,
    providerKeys: [
      { provider: 'anthropic', set: !!config.anthropicApiKey },
      { provider: 'gemini', set: !!config.geminiApiKey },
      { provider: 'kimi', set: !!config.kimiApiKey },
      { provider: 'deepseek', set: !!config.deepseekApiKey },
      { provider: 'openai', set: !!config.openaiApiKey },
    ],
    knowledgeBackend: config.knowledgeBackend,
    gateways: [
      { name: 'Slack', connected: !!config.slackWebhookUrl },
      { name: 'Discord', connected: !!config.discordWebhookUrl },
      { name: 'WhatsApp', connected: !!config.whatsappApiToken },
      { name: 'Email (SMTP)', connected: !!config.smtpUrl },
    ],
  };
}
