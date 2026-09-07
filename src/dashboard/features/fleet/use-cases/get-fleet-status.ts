import type { DashboardDeps } from '../../../dashboard-deps.ts';
import type { WorkerRow } from '../../../../services/agent-service/fleet-db.ts';

export interface FleetStatusData {
  workers: WorkerRow[];
}

export function getFleetStatus(deps: Pick<DashboardDeps, 'fleetDb'>): FleetStatusData {
  return { workers: deps.fleetDb.listWorkers() };
}
