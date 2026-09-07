import { describe, expect, it } from 'bun:test';
import { getAmpStatus } from './get-amp-status.ts';
import { loadConfig } from '../../../../config/index.ts';

describe('getAmpStatus', () => {
  it('reports each gateway as connected only when its real config field is set', () => {
    const config = loadConfig({
      GITHUB_TOKEN: 'x',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x',
      DISCORD_WEBHOOK_URL: '',
      WHATSAPP_API_TOKEN: '',
      SMTP_URL: '',
    });

    const status = getAmpStatus({ config });

    const slack = status.gateways.find(g => g.name === 'Slack');
    const discord = status.gateways.find(g => g.name === 'Discord');
    expect(slack?.connected).toBe(true);
    expect(discord?.connected).toBe(false);
  });

  it('reports a single-instance node — no fabricated multi-machine peer mesh', () => {
    const config = loadConfig({ GITHUB_TOKEN: 'x' });
    const status = getAmpStatus({ config });
    expect(status.nodeCount).toBe(1);
  });
});
