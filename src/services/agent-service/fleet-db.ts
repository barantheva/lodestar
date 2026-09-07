import type { Database } from 'bun:sqlite';
import { openFleetDb } from '../../data-access/fleet-db-client.ts';

export type WorkerState = 'idle' | 'running' | 'paused_rate_limited' | 'restarting' | 'crashed';

export interface WorkerRow {
  name: string;
  job: string;
  provider: string;
  state: WorkerState;
  pid?: number;
  rssMb?: number;
  cpuPct?: number;
  worktree?: string;
  lastHeartbeat?: number;
}

export interface RateLimitHold {
  workerName: string;
  trackId: string;
  provider: string;
  resumeAt: number;
}

function rowToWorker(row: any): WorkerRow {
  return {
    name: row.name,
    job: row.job,
    provider: row.provider,
    state: row.state,
    pid: row.pid ?? undefined,
    rssMb: row.rss_mb ?? undefined,
    cpuPct: row.cpu_pct ?? undefined,
    worktree: row.worktree ?? undefined,
    lastHeartbeat: row.last_heartbeat ?? undefined,
  };
}

function rowToHold(row: any): RateLimitHold {
  return { workerName: row.worker_name, trackId: row.track_id, provider: row.provider, resumeAt: row.resume_at };
}

export class FleetDb {
  private db: Database;

  constructor(path: string = ':memory:') {
    this.db = openFleetDb(path);
  }

  upsertWorker(worker: WorkerRow): void {
    this.db.run(
      `INSERT INTO workers (name, job, provider, state, pid, rss_mb, cpu_pct, worktree, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         job = excluded.job, provider = excluded.provider, state = excluded.state,
         pid = excluded.pid, rss_mb = excluded.rss_mb, cpu_pct = excluded.cpu_pct,
         worktree = excluded.worktree, last_heartbeat = excluded.last_heartbeat`,
      [
        worker.name,
        worker.job,
        worker.provider,
        worker.state,
        worker.pid ?? null,
        worker.rssMb ?? null,
        worker.cpuPct ?? null,
        worker.worktree ?? null,
        worker.lastHeartbeat ?? null,
      ]
    );
  }

  getWorker(name: string): WorkerRow | undefined {
    const row = this.db.query('SELECT * FROM workers WHERE name = ?').get(name) as any;
    return row ? rowToWorker(row) : undefined;
  }

  listWorkers(): WorkerRow[] {
    const rows = this.db.query('SELECT * FROM workers').all() as any[];
    return rows.map(rowToWorker);
  }

  setState(name: string, state: WorkerState): void {
    this.db.run('UPDATE workers SET state = ? WHERE name = ?', [state, name]);
  }

  recordHeartbeat(name: string, info: { pid?: number; rssMb?: number; cpuPct?: number }): void {
    this.db.run('UPDATE workers SET pid = ?, rss_mb = ?, cpu_pct = ?, last_heartbeat = ? WHERE name = ?', [
      info.pid ?? null,
      info.rssMb ?? null,
      info.cpuPct ?? null,
      Date.now(),
      name,
    ]);
  }

  addRateLimitHold(hold: { workerName: string; trackId?: string; provider: string; resumeAt?: number }): void {
    const resumeAt = hold.resumeAt ?? Date.now() + 6 * 3600 * 1000;
    this.db.run('INSERT INTO rate_limit_holds (worker_name, track_id, provider, resume_at) VALUES (?, ?, ?, ?)', [
      hold.workerName,
      hold.trackId ?? '',
      hold.provider,
      resumeAt,
    ]);
  }

  getActiveHolds(): RateLimitHold[] {
    const rows = this.db.query('SELECT * FROM rate_limit_holds').all() as any[];
    return rows.map(rowToHold);
  }

  clearExpiredHolds(now: number = Date.now()): RateLimitHold[] {
    const rows = this.db.query('SELECT * FROM rate_limit_holds WHERE resume_at <= ?').all(now) as any[];
    this.db.run('DELETE FROM rate_limit_holds WHERE resume_at <= ?', [now]);
    return rows.map(rowToHold);
  }

  close(): void {
    this.db.close();
  }
}
