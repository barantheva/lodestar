import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { FleetDb } from './fleet-db.ts';

describe('FleetDb', () => {
  let fleetDb: FleetDb;

  beforeEach(() => {
    fleetDb = new FleetDb(':memory:');
  });

  afterEach(() => {
    fleetDb.close();
  });

  it('upserts and retrieves a worker', () => {
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'idle' });

    const worker = fleetDb.getWorker('agent-1');
    expect(worker?.name).toBe('agent-1');
    expect(worker?.job).toBe('issue-monitor');
    expect(worker?.state).toBe('idle');
  });

  it('overwrites fields on repeated upsert for the same worker name', () => {
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'idle' });
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'running', pid: 123 });

    const worker = fleetDb.getWorker('agent-1');
    expect(worker?.state).toBe('running');
    expect(worker?.pid).toBe(123);
  });

  it('lists all workers', () => {
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'idle' });
    fleetDb.upsertWorker({ name: 'agent-2', job: 'incident-monitor', provider: 'gemini', state: 'idle' });

    const workers = fleetDb.listWorkers();
    expect(workers).toHaveLength(2);
    expect(workers.map(w => w.name).sort()).toEqual(['agent-1', 'agent-2']);
  });

  it('records a heartbeat, updating pid/rss/cpu/lastHeartbeat', () => {
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'running' });
    const before = Date.now();

    fleetDb.recordHeartbeat('agent-1', { pid: 999, rssMb: 42, cpuPct: 3.5 });

    const worker = fleetDb.getWorker('agent-1');
    expect(worker?.pid).toBe(999);
    expect(worker?.rssMb).toBe(42);
    expect(worker?.cpuPct).toBe(3.5);
    expect(worker?.lastHeartbeat).toBeGreaterThanOrEqual(before);
  });

  it('sets a worker state directly', () => {
    fleetDb.upsertWorker({ name: 'agent-1', job: 'issue-monitor', provider: 'claude', state: 'idle' });
    fleetDb.setState('agent-1', 'crashed');
    expect(fleetDb.getWorker('agent-1')?.state).toBe('crashed');
  });

  it('adds a rate-limit hold and lists it as active', () => {
    const resumeAt = Date.now() + 60_000;
    fleetDb.addRateLimitHold({ workerName: 'agent-1', trackId: 'track-1', provider: 'claude', resumeAt });

    const holds = fleetDb.getActiveHolds();
    expect(holds).toHaveLength(1);
    expect(holds[0].workerName).toBe('agent-1');
    expect(holds[0].resumeAt).toBe(resumeAt);
  });

  it('clears expired holds and returns them, leaving unexpired holds active', () => {
    const now = Date.now();
    fleetDb.addRateLimitHold({ workerName: 'agent-1', trackId: 'track-1', provider: 'claude', resumeAt: now - 1000 });
    fleetDb.addRateLimitHold({ workerName: 'agent-2', trackId: 'track-2', provider: 'claude', resumeAt: now + 60_000 });

    const cleared = fleetDb.clearExpiredHolds(now);

    expect(cleared).toHaveLength(1);
    expect(cleared[0].workerName).toBe('agent-1');

    const stillActive = fleetDb.getActiveHolds();
    expect(stillActive).toHaveLength(1);
    expect(stillActive[0].workerName).toBe('agent-2');
  });

  it('defaults resumeAt fallback to +6h when a caller passes no explicit resumeAt', () => {
    const before = Date.now();
    fleetDb.addRateLimitHold({ workerName: 'agent-1', trackId: 'track-1', provider: 'claude' });

    const holds = fleetDb.getActiveHolds();
    expect(holds[0].resumeAt).toBeGreaterThanOrEqual(before + 6 * 3600 * 1000 - 1000);
  });
});
