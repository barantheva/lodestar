import { describe, expect, it } from 'bun:test';
import { getMonitorSetup } from './get-monitor-setup.ts';
import { loadConfig } from '../../../../config/index.ts';

describe('getMonitorSetup', () => {
  it('lists real configured repos and counts real campaign-job fleet agents', () => {
    const config = loadConfig({
      GITHUB_TOKEN: 'x',
      GITHUB_REPO: 'owner/a,owner/b',
      AGENT_COUNT: '2',
      AGENT_1_PROVIDER: 'claude',
      AGENT_1_JOB: 'instrumentation-campaign',
      AGENT_2_PROVIDER: 'gemini',
      AGENT_2_JOB: 'issue-monitor',
    });

    const data = getMonitorSetup({ config });

    expect(data.repos).toEqual(['owner/a', 'owner/b']);
    expect(data.campaignAgentsConfigured).toBe(1);
  });

  it('reports zero campaign agents honestly when none are configured', () => {
    const config = loadConfig({ GITHUB_TOKEN: 'x' });
    const data = getMonitorSetup({ config });
    expect(data.campaignAgentsConfigured).toBe(0);
  });
});
