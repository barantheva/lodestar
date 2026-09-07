import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { listTracks, type TrackRecord } from '../../../../services/monitor-service/track-reader.ts';

export interface RunHistoryData {
  shippedTracks: TrackRecord[];
}

export async function getRunHistory(deps: Pick<DashboardDeps, 'baseDir'>): Promise<RunHistoryData> {
  const tracks = await listTracks(deps.baseDir);
  return { shippedTracks: tracks.filter(t => t.status === 'shipped') };
}
