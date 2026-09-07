import { spawn, type ChildProcess } from 'node:child_process';
import type { FleetDb } from './fleet-db.ts';
import type { EventBus } from '../../core/event-bus.ts';

export interface WorkerSpec {
  name: string;
  job: string;
  provider: string;
  repo: string;
}

export type SpawnFn = (command: string, args: string[], options: Record<string, unknown>) => ChildProcess;

function buildWorkerCommand(spec: WorkerSpec): { command: string; args: string[] } {
  return {
    command: 'bun',
    args: ['run', 'src/cli/index.ts', 'worker', '--job', spec.job, '--provider', spec.provider, '--repo', spec.repo],
  };
}

export class Supervisor {
  private specs: Map<string, WorkerSpec> = new Map();
  private children: Map<string, ChildProcess> = new Map();
  private stopped: Set<string> = new Set();

  constructor(
    private fleetDb: FleetDb,
    eventBus: EventBus,
    private spawnImpl: SpawnFn = spawn as unknown as SpawnFn
  ) {
    eventBus.on('rate_limit.hit', payload => {
      this.fleetDb.addRateLimitHold({ workerName: payload.workerName, provider: payload.provider, resumeAt: payload.resumeAt });
      this.fleetDb.setState(payload.workerName, 'paused_rate_limited');
    });
  }

  public start(spec: WorkerSpec): void {
    this.specs.set(spec.name, spec);
    this.stopped.delete(spec.name);
    this.spawn(spec);
  }

  private spawn(spec: WorkerSpec): void {
    const { command, args } = buildWorkerCommand(spec);
    const child = this.spawnImpl(command, args, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    this.children.set(spec.name, child);

    this.fleetDb.upsertWorker({ name: spec.name, job: spec.job, provider: spec.provider, state: 'running', pid: child.pid });

    child.on('message', (msg: any) => {
      if (msg?.type === 'heartbeat') {
        this.fleetDb.recordHeartbeat(spec.name, { pid: child.pid, rssMb: msg.rssMb, cpuPct: msg.cpuPct });
      }
    });

    child.on('exit', () => {
      this.children.delete(spec.name);
      if (this.stopped.has(spec.name)) {
        this.fleetDb.setState(spec.name, 'idle');
        return;
      }
      this.fleetDb.setState(spec.name, 'restarting');
      this.spawn(spec);
    });
  }

  public stop(name: string): void {
    this.stopped.add(name);
    const child = this.children.get(name);
    if (child) {
      child.kill('SIGTERM');
    } else {
      this.fleetDb.setState(name, 'idle');
    }
  }

  public checkAndResumeHolds(now: number = Date.now()): void {
    const cleared = this.fleetDb.clearExpiredHolds(now);
    for (const hold of cleared) {
      const spec = this.specs.get(hold.workerName);
      if (!spec) continue;
      this.stopped.delete(hold.workerName);
      if (!this.children.has(hold.workerName)) {
        this.spawn(spec);
      } else {
        this.fleetDb.setState(hold.workerName, 'running');
      }
    }
  }
}
