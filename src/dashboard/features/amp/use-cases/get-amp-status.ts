import type { DashboardDeps } from '../../../dashboard-deps.ts';

export interface GatewayStatus {
  name: string;
  connected: boolean;
  detail: string;
}

export interface AmpData {
  nodeCount: number;
  gateways: GatewayStatus[];
}

export function getAmpStatus(deps: Pick<DashboardDeps, 'config'>): AmpData {
  const { config } = deps;

  return {
    nodeCount: 1,
    gateways: [
      { name: 'Slack', connected: !!config.slackWebhookUrl, detail: config.slackWebhookUrl ? 'SLACK_WEBHOOK_URL configured' : 'SLACK_WEBHOOK_URL not set' },
      { name: 'Discord', connected: !!config.discordWebhookUrl, detail: config.discordWebhookUrl ? 'DISCORD_WEBHOOK_URL configured' : 'DISCORD_WEBHOOK_URL not set' },
      { name: 'WhatsApp', connected: !!config.whatsappApiToken, detail: config.whatsappApiToken ? `${config.whatsappBroadcastList.length} broadcast recipient(s)` : 'WHATSAPP_API_TOKEN not set' },
      { name: 'Email (SMTP)', connected: !!config.smtpUrl, detail: config.smtpUrl ? `${config.alertEmailTo.length} recipient(s)` : 'SMTP_URL not set' },
    ],
  };
}
