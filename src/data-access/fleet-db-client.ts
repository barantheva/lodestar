import { Database } from 'bun:sqlite';

export function openFleetDb(path: string = ':memory:'): Database {
  const db = new Database(path);

  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      name TEXT PRIMARY KEY,
      job TEXT NOT NULL,
      provider TEXT NOT NULL,
      state TEXT NOT NULL,
      pid INTEGER,
      rss_mb INTEGER,
      cpu_pct REAL,
      worktree TEXT,
      last_heartbeat INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rate_limit_holds (
      worker_name TEXT NOT NULL REFERENCES workers(name),
      track_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      resume_at INTEGER NOT NULL
    )
  `);

  return db;
}
