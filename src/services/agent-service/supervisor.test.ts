import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import { Supervisor, type WorkerSpec } from './supervisor.ts';
import { FleetDb } from './fleet-db.ts';
import { EventBus } from '../../core/event-bus.ts';

function fakeChild() {
  const ee: any = new EventEmitter();
  ee.pid = 4242;
  ee.kill = () => ee.emit('exit', null, 'SIGTERM');
  return ee;
}

describe('Supervisor', () => {
  let fleetDb: FleetDb;
  let eventBus: EventBus;

  beforeEach(() => {
    fleetDb = new FleetDb(':memory:');
    eventBus = new EventBus();
  });

  afterEach(() => {
    fleetDb.close();
  });

  const spec: WorkerSpec = { name: 'agent-1', job: 'issue-monitor', provider: 'claude', repo: 'owner/repo' };

  it('spawns a worker and records it running with a pid in the Fleet DB', () => {
    const children: any[] = [];
    const spawnImpl = (() => {
      const child = fakeChild();
      children.push(child);
      return child;
    }) as any;

    const supervisor = new Supervisor(fleetDb, eventBus, spawnImpl);
    supervisor.start(spec);

    const worker = fleetDb.getWorker('agent-1');
    expect(worker?.state).toBe('running');
    expect(worker?.pid).toBe(4242);
    expect(children).toHaveLength(1);
  });

  it('auto-restarts a worker that exits unexpectedly', () => {
    const children: any[] = [];
    const spawnImpl = (() => {
      const child = fakeChild();
      children.push(child);
      return child;
    }) as any;

    const supervisor = new Supervisor(fleetDb, eventBus, spawnImpl);
    supervisor.start(spec);

    children[0].emit('exit', 1, null);

    expect(children).toHaveLength(2);
    expect(fleetDb.getWorker('agent-1')?.state).toBe('running');
  });

  it('does not auto-restart a worker that was intentionally stopped', () => {
    const children: any[] = [];
    const spawnImpl = (() => {
      const child = fakeChild();
      children.push(child);
      return child;
    }) as any;

    const supervisor = new Supervisor(fleetDb, eventBus, spawnImpl);
    supervisor.start(spec);
    supervisor.stop('agent-1');

    expect(children).toHaveLength(1);
    expect(fleetDb.getWorker('agent-1')?.state).toBe('idle');
  });

  it('records a heartbeat sent by the worker over IPC', () => {
    const child = fakeChild();
    const spawnImpl = (() => child) as any;

    const supervisor = new Supervisor(fleetDb, eventBus, spawnImpl);
    supervisor.start(spec);

    child.emit('message', { type: 'heartbeat', rssMb: 55, cpuPct: 2.1 });

    const worker = fleetDb.getWorker('agent-1');
    expect(worker?.rssMb).toBe(55);
    expect(worker?.cpuPct).toBe(2.1);
  });

  it('holds a worker on rate_limit.hit and clears the hold once resume_at passes', async () => {
    const child = fakeChild();
    const spawnImpl = (() => child) as any;

    const supervisor = new Supervisor(fleetDb, eventBus, spawnImpl);
    supervisor.start(spec);

    await eventBus.emit('rate_limit.hit', { workerName: 'agent-1', provider: 'claude', resumeAt: Date.now() - 1 });

    expect(fleetDb.getWorker('agent-1')?.state).toBe('paused_rate_limited');
    expect(fleetDb.getActiveHolds()).toHaveLength(1);

    supervisor.checkAndResumeHolds();

    expect(fleetDb.getActiveHolds()).toHaveLength(0);
    expect(fleetDb.getWorker('agent-1')?.state).toBe('running');
  });
});
