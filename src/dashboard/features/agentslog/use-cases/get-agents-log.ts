import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { SessionMemory } from '../../../../plugins/memory/session-memory.ts';

export interface AgentsLogEntry {
  agentName: string;
  message: string;
  timestamp: number;
  trackId?: string;
  stage?: string;
}

export interface AgentsLogData {
  entries: AgentsLogEntry[];
  backendConfigured: boolean;
}

export async function getAgentsLog(deps: Pick<DashboardDeps, 'fleetDb' | 'memoryBackend'>): Promise<AgentsLogData> {
  if (!deps.memoryBackend) {
    return { entries: [], backendConfigured: false };
  }

  const sessionMemory = new SessionMemory(deps.memoryBackend);
  const workerNames = deps.fleetDb.listWorkers().map(w => w.name);

  const entries: AgentsLogEntry[] = [];
  for (const agentName of workerNames) {
    const journal = await sessionMemory.getDevJournal(agentName);
    for (const item of journal) {
      entries.push({
        agentName: (item.agentName as string) || agentName,
        message: (item.message as string) || '',
        timestamp: (item.timestamp as number) || 0,
        trackId: item.trackId as string | undefined,
        stage: item.stage as string | undefined,
      });
    }
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return { entries, backendConfigured: true };
}
