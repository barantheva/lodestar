import { describe, expect, it } from 'bun:test';
import { getConfigView } from './get-config-view.ts';
import { loadConfig } from '../../../../config/index.ts';

describe('getConfigView', () => {
  it('masks secrets, never exposing the raw token/key value', () => {
    const config = loadConfig({ GITHUB_TOKEN: 'ghp_supersecret1234', ANTHROPIC_API_KEY: 'sk-ant-abc123' });
    const view = getConfigView({ config });

    expect(view.githubTokenSet).toBe(true);
    expect(JSON.stringify(view)).not.toContain('ghp_supersecret1234');
    expect(JSON.stringify(view)).not.toContain('sk-ant-abc123');
  });

  it('reflects real fleet agents and gateway connection status', () => {
    const config = loadConfig({
      GITHUB_TOKEN: 'x',
      AGENT_COUNT: '1',
      AGENT_1_PROVIDER: 'claude',
      AGENT_1_JOB: 'issue-monitor',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x',
    });

    const view = getConfigView({ config });

    expect(view.fleetAgents).toEqual([{ name: 'agent-1', provider: 'claude', job: 'issue-monitor' }]);
    expect(view.gateways.find(g => g.name === 'Slack')?.connected).toBe(true);
  });

  it('reflects real team-mode gate signers when set', () => {
    const config = loadConfig({ GITHUB_TOKEN: 'x', TEAM_MODE: 'team', ANALYST_NAME: 'Sarah Chen', LEAD_NAME: 'Alex Chen' });
    const view = getConfigView({ config });

    expect(view.teamMode).toBe('team');
    expect(view.analystName).toBe('Sarah Chen');
    expect(view.leadName).toBe('Alex Chen');
  });

  it('reports gate signers as unset honestly when not configured', () => {
    const config = loadConfig({ GITHUB_TOKEN: 'x' });
    const view = getConfigView({ config });

    expect(view.analystName).toBeUndefined();
    expect(view.leadName).toBeUndefined();
  });
});
