import { describe, expect, it } from 'bun:test';
import { loadConfig, parseDotEnv } from './index.ts';

describe('Config Loader', () => {
  it('parses dotenv formatted strings correctly', () => {
    const raw = `
      # Comments should be ignored
      GITHUB_TOKEN=ghp_test12345
      PORT=4000
      DATA_DIR="/custom/path"
      TEAM_MODE='team'
      INVALID_LINE
    `;
    const parsed = parseDotEnv(raw);
    expect(parsed.GITHUB_TOKEN).toBe('ghp_test12345');
    expect(parsed.PORT).toBe('4000');
    expect(parsed.DATA_DIR).toBe('/custom/path');
    expect(parsed.TEAM_MODE).toBe('team');
    expect(parsed.INVALID_LINE).toBeUndefined();
  });

  it('throws error when GITHUB_TOKEN is missing', () => {
    expect(() => {
      loadConfig({ GITHUB_TOKEN: '' });
    }).toThrow('Missing required environment variable: GITHUB_TOKEN');
  });

  it('throws error when PRIMARY_AUTO_CODER is invalid', () => {
    expect(() => {
      loadConfig({
        GITHUB_TOKEN: 'token_123',
        PRIMARY_AUTO_CODER: 'invalid_model' as any,
      });
    }).toThrow('Invalid PRIMARY_AUTO_CODER');
  });

  it('validates provider-specific keys when primary model is set', () => {
    expect(() => {
      loadConfig({
        GITHUB_TOKEN: 'token_123',
        PRIMARY_AUTO_CODER: 'gemini',
        GEMINI_API_KEY: '',
      });
    }).toThrow('Missing required environment variable for PRIMARY_AUTO_CODER=gemini');

    expect(() => {
      loadConfig({
        GITHUB_TOKEN: 'token_123',
        PRIMARY_AUTO_CODER: 'kimi',
        KIMI_API_KEY: '',
      });
    }).toThrow('Missing required environment variable for PRIMARY_AUTO_CODER=kimi');

    expect(() => {
      loadConfig({
        GITHUB_TOKEN: 'token_123',
        PRIMARY_AUTO_CODER: 'deepseek',
        DEEPSEEK_API_KEY: '',
      });
    }).toThrow('Missing required environment variable for PRIMARY_AUTO_CODER=deepseek');

    expect(() => {
      loadConfig({
        GITHUB_TOKEN: 'token_123',
        PRIMARY_AUTO_CODER: 'openai',
        OPENAI_API_KEY: '',
      });
    }).toThrow('Missing required environment variable for PRIMARY_AUTO_CODER=openai');
  });

  it('defaults relayStopSlopProvider to primaryAutoCoder when unset', () => {
    const cfg = loadConfig({ GITHUB_TOKEN: 'ghp_valid_secret', PRIMARY_AUTO_CODER: 'openai', OPENAI_API_KEY: 'sk-key' });
    expect(cfg.relayStopSlopProvider).toBe('openai');
  });

  it('honors an explicit RELAY_STOP_SLOP_PROVIDER override', () => {
    const cfg = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      PRIMARY_AUTO_CODER: 'claude',
      RELAY_STOP_SLOP_PROVIDER: 'gemini',
    });
    expect(cfg.relayStopSlopProvider).toBe('gemini');
  });

  it('parses AGENT_N_PROVIDER/AGENT_N_JOB pairs into fleetAgents up to AGENT_COUNT', () => {
    const cfg = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      AGENT_COUNT: '2',
      AGENT_1_PROVIDER: 'claude',
      AGENT_1_JOB: 'incident-monitor',
      AGENT_2_PROVIDER: 'deepseek',
      AGENT_2_JOB: 'issue-monitor',
      AGENT_3_PROVIDER: 'gemini',
      AGENT_3_JOB: 'codebase-monitor',
    });

    expect(cfg.fleetAgents).toEqual([
      { name: 'agent-1', provider: 'claude', job: 'incident-monitor' },
      { name: 'agent-2', provider: 'deepseek', job: 'issue-monitor' },
    ]);
  });

  it('honors an explicit PORT=0 (OS-assigned ephemeral port), not falling back to the default of 3000', () => {
    const cfg = loadConfig({ GITHUB_TOKEN: 'ghp_valid_secret', PORT: '0' });
    expect(cfg.port).toBe(0);
  });

  it('honors an explicit AGENT_COUNT=0, not falling back to the default of 3', () => {
    const cfg = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      AGENT_COUNT: '0',
      AGENT_1_PROVIDER: 'claude',
      AGENT_1_JOB: 'incident-monitor',
    });

    expect(cfg.agentCount).toBe(0);
    expect(cfg.fleetAgents).toEqual([]);
  });

  it('loads organizational gateway vars when present, leaving them undefined otherwise', () => {
    const withGateways = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/x',
      WHATSAPP_API_TOKEN: 'wa_token',
      WHATSAPP_BROADCAST_LIST: '+1555,+1556',
      SMTP_URL: 'smtp://mail.example.com',
      ALERT_EMAIL_TO: 'a@example.com,b@example.com',
    });

    expect(withGateways.slackWebhookUrl).toBe('https://hooks.slack.com/services/x');
    expect(withGateways.discordWebhookUrl).toBe('https://discord.com/api/webhooks/x');
    expect(withGateways.whatsappApiToken).toBe('wa_token');
    expect(withGateways.whatsappBroadcastList).toEqual(['+1555', '+1556']);
    expect(withGateways.smtpUrl).toBe('smtp://mail.example.com');
    expect(withGateways.alertEmailTo).toEqual(['a@example.com', 'b@example.com']);

    const withoutGateways = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      SLACK_WEBHOOK_URL: '',
      DISCORD_WEBHOOK_URL: '',
      WHATSAPP_API_TOKEN: '',
      SMTP_URL: '',
    });
    expect(withoutGateways.slackWebhookUrl).toBeUndefined();
    expect(withoutGateways.discordWebhookUrl).toBeUndefined();
    expect(withoutGateways.whatsappBroadcastList).toEqual([]);
    expect(withoutGateways.alertEmailTo).toEqual([]);
  });

  it('loads valid configuration with defaults', () => {
    const cfg = loadConfig({
      GITHUB_TOKEN: 'ghp_valid_secret',
      PRIMARY_AUTO_CODER: 'claude',
      GITHUB_REPO: 'owner/repo1, owner/repo2',
      ISSUE_LABEL_FILTER: 'bug, fix',
      PORT: '8080',
      TEAM_MODE: 'team',
      ANALYST_NAME: 'Alice Analyst',
      LEAD_NAME: 'Bob Lead',
      ALLOW_AUTONOMOUS_INCIDENT_DECLARATION: 'true',
      AGENT_COUNT: '5',
      FALLBACK_AUTO_CODERS: 'gemini,deepseek,openai',
      OPENAI_API_KEY: 'sk-test',
      KNOWLEDGE_BACKEND: 'obsidian',
      LOADSTONENEXUS_MCP_MODE: 'remote',
    });

    expect(cfg.githubToken).toBe('ghp_valid_secret');
    expect(cfg.primaryAutoCoder).toBe('claude');
    expect(cfg.githubRepos).toEqual(['owner/repo1', 'owner/repo2']);
    expect(cfg.issueLabelFilter).toEqual(['bug', 'fix']);
    expect(cfg.port).toBe(8080);
    expect(cfg.teamMode).toBe('team');
    expect(cfg.analystName).toBe('Alice Analyst');
    expect(cfg.leadName).toBe('Bob Lead');
    expect(cfg.allowAutonomousIncidentDeclaration).toBe(true);
    expect(cfg.agentCount).toBe(5);
    expect(cfg.fallbackAutoCoders).toEqual(['gemini', 'deepseek', 'openai']);
    expect(cfg.openaiApiKey).toBe('sk-test');
    expect(cfg.knowledgeBackend).toBe('obsidian');
    expect(cfg.loadstoneNexusMcpMode).toBe('remote');
  });
});
