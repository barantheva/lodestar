import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getAgentsLog } from './get-agents-log.ts';
import { FleetDb } from '../../../../services/agent-service/fleet-db.ts';
import { LoadstoneNexusBackend } from '../../../../services/memory-service/loadstonenexus-backend.ts';
import { SessionMemory } from '../../../../plugins/memory/session-memory.ts';

describe('getAgentsLog', () => {
  const testDataDir = path.join(process.cwd(), '.test-agentslog-data-' + Date.now());
  let memoryBackend: LoadstoneNexusBackend;
  let fleetDb: FleetDb;

  afterEach(async () => {
    memoryBackend?.close();
    fleetDb?.close();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('reports backend not configured honestly when no memory backend is wired', async () => {
    fleetDb = new FleetDb(':memory:');
    const data = await getAgentsLog({ fleetDb, memoryBackend: undefined });
    expect(data.backendConfigured).toBe(false);
    expect(data.entries).toEqual([]);
  });

  it('reads real persisted dev-journal entries for registered workers, newest first', async () => {
    fleetDb = new FleetDb(':memory:');
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'running' });

    memoryBackend = new LoadstoneNexusBackend({ mode: 'local', dataDir: testDataDir });
    const sessionMemory = new SessionMemory(memoryBackend);
    await sessionMemory.persistDevJournal('agent-1', 'applying patch', { trackId: 'track-1', stage: 'relay-implementer' });

    const data = await getAgentsLog({ fleetDb, memoryBackend });

    expect(data.backendConfigured).toBe(true);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].message).toBe('applying patch');
    expect(data.entries[0].agentName).toBe('agent-1');
  });
});
