import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { listTracks } from '../../../../services/monitor-service/track-reader.ts';

export interface RelayStatusData {
  totalTracks: number;
  shapePending: number;
  planInProgress: number;
  shipped: number;
}

export async function getRelayStatus(deps: Pick<DashboardDeps, 'baseDir'>): Promise<RelayStatusData> {
  const tracks = await listTracks(deps.baseDir);

  return {
    totalTracks: tracks.length,
    shapePending: tracks.filter(t => t.status === 'guard1_pending').length,
    planInProgress: tracks.filter(t => t.status === 'in_progress').length,
    shipped: tracks.filter(t => t.status === 'shipped').length,
  };
}
