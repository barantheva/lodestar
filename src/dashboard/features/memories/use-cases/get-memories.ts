import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { listTracks, type TrackRecord } from '../../../../services/monitor-service/track-reader.ts';

export interface MemoriesData {
  tracks: TrackRecord[];
}

export async function getMemories(deps: Pick<DashboardDeps, 'baseDir'>): Promise<MemoriesData> {
  const tracks = await listTracks(deps.baseDir);
  return { tracks };
}
