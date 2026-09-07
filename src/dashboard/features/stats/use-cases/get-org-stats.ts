import { listTracks } from '../../../../services/monitor-service/track-reader.ts';
import type { RateLimitHold } from '../../../../services/agent-service/fleet-db.ts';
import type { DashboardDeps } from '../../../dashboard-deps.ts';

export interface OrgStats {
  totalTracks: number;
  shipped: number;
  guard1Pending: number;
  inProgress: number;
  archetypeBreakdown: Record<'A' | 'B' | 'C' | 'H', number>;
  repoBreakdown: { repo: string; shipped: number }[];
  activeRateLimitHolds: RateLimitHold[];
}

export async function getOrgStats(deps: Pick<DashboardDeps, 'baseDir' | 'fleetDb'>): Promise<OrgStats> {
  const tracks = await listTracks(deps.baseDir);

  const archetypeBreakdown: OrgStats['archetypeBreakdown'] = { A: 0, B: 0, C: 0, H: 0 };
  const shippedByRepo = new Map<string, number>();
  let shipped = 0;
  let guard1Pending = 0;
  let inProgress = 0;

  for (const track of tracks) {
    if (track.archetype) archetypeBreakdown[track.archetype]++;
    if (track.status === 'shipped') {
      shipped++;
      if (track.repo) shippedByRepo.set(track.repo, (shippedByRepo.get(track.repo) || 0) + 1);
    } else if (track.status === 'guard1_pending') {
      guard1Pending++;
    } else if (track.status === 'in_progress') {
      inProgress++;
    }
  }

  return {
    totalTracks: tracks.length,
    shipped,
    guard1Pending,
    inProgress,
    archetypeBreakdown,
    repoBreakdown: [...shippedByRepo.entries()].map(([repo, count]) => ({ repo, shipped: count })),
    activeRateLimitHolds: deps.fleetDb.getActiveHolds(),
  };
}
