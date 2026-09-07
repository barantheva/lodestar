import { describe, expect, it } from 'bun:test';
import { getFleetStatus } from './get-fleet-status.ts';
import { FleetDb } from '../../../../services/agent-service/fleet-db.ts';

describe('getFleetStatus', () => {
  it('returns an empty fleet when no workers have registered yet', () => {
    const fleetDb = new FleetDb(':memory:');
    const data = getFleetStatus({ fleetDb });
    expect(data.workers).toEqual([]);
    fleetDb.close();
  });

  it('returns real worker rows from the Fleet DB', () => {
    const fleetDb = new FleetDb(':memory:');
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'running', pid: 123 });

    const data = getFleetStatus({ fleetDb });

    expect(data.workers).toHaveLength(1);
    expect(data.workers[0].name).toBe('agent-1');
    expect(data.workers[0].pid).toBe(123);
    fleetDb.close();
  });
});
