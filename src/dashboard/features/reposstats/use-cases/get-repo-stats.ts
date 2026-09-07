import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { listTracks } from '../../../../services/monitor-service/track-reader.ts';

export interface RepoStats {
  repo: string;
  shipped: number;
  guard1Pending: number;
  inProgress: number;
}

export interface RepoStatsData {
  repos: RepoStats[];
}

export async function getRepoStats(deps: Pick<DashboardDeps, 'baseDir' | 'config'>): Promise<RepoStatsData> {
  const tracks = await listTracks(deps.baseDir);
  const repoNames = deps.config.githubRepos.length > 0
    ? deps.config.githubRepos
    : [...new Set(tracks.map(t => t.repo).filter((r): r is string => !!r))];

  const repos = repoNames.map(repo => {
    const repoTracks = tracks.filter(t => t.repo === repo);
    return {
      repo,
      shipped: repoTracks.filter(t => t.status === 'shipped').length,
      guard1Pending: repoTracks.filter(t => t.status === 'guard1_pending').length,
      inProgress: repoTracks.filter(t => t.status === 'in_progress').length,
    };
  });

  return { repos };
}
