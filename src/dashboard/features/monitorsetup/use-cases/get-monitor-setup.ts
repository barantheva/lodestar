import type { DashboardDeps } from '../../../dashboard-deps.ts';

export interface MonitorSetupData {
  repos: string[];
  campaignAgentsConfigured: number;
}

export function getMonitorSetup(deps: Pick<DashboardDeps, 'config'>): MonitorSetupData {
  return {
    repos: deps.config.githubRepos,
    campaignAgentsConfigured: deps.config.fleetAgents.filter(a => a.job === 'instrumentation-campaign').length,
  };
}
