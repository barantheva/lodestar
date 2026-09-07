import { describe, expect, it } from 'bun:test';
import { openFleetDb } from './fleet-db-client.ts';

describe('openFleetDb', () => {
  it('creates the workers and rate_limit_holds tables', () => {
    const db = openFleetDb(':memory:');

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map(t => t.name);

    expect(names).toContain('workers');
    expect(names).toContain('rate_limit_holds');
    db.close();
  });

  it('is idempotent when opened twice against the same file', () => {
    const path = `/tmp/lodestar-fleet-test-${Date.now()}.sqlite`;
    const db1 = openFleetDb(path);
    db1.run("INSERT INTO workers (name, job, provider, state) VALUES ('w1', 'issue-monitor', 'claude', 'idle')");
    db1.close();

    const db2 = openFleetDb(path);
    const row = db2.query('SELECT * FROM workers WHERE name = ?').get('w1') as any;
    expect(row.name).toBe('w1');
    db2.close();
  });
});
