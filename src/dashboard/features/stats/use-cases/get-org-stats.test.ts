import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getOrgStats } from './get-org-stats.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';
import { FleetDb } from '../../../../services/agent-service/fleet-db.ts';

describe('getOrgStats', () => {
  const testBaseDir = path.join(process.cwd(), '.test-get-org-stats-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('aggregates shipped/pending counts and repo breakdown from real tracks', async () => {
    const service = new PlanningService();
    const ctx1: TaskContext = { trackId: 't1', repo: 'owner/repo-a', issueNumber: 1, issueTitle: 'A', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctx1, 'B', 'analyst');
    await service.generatePlan(ctx1, 'engineer');
    await service.generateEvidence(ctx1, 'ok', 'lead', { verdict: 'PASS', reasons: 'clean' });

    const ctx2: TaskContext = { trackId: 't2', repo: 'owner/repo-b', issueNumber: 2, issueTitle: 'B', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctx2, 'C');

    const fleetDb = new FleetDb(':memory:');
    const stats = await getOrgStats({ baseDir: testBaseDir, fleetDb });
    fleetDb.close();

    expect(stats.totalTracks).toBe(2);
    expect(stats.shipped).toBe(1);
    expect(stats.guard1Pending).toBe(1);
    expect(stats.repoBreakdown).toEqual([{ repo: 'owner/repo-a', shipped: 1 }]);
  });

  it('reports active rate-limit holds from the Fleet DB', async () => {
    const fleetDb = new FleetDb(':memory:');
    fleetDb.addRateLimitHold({ workerName: 'agent-1', provider: 'claude', resumeAt: Date.now() + 60_000 });

    const stats = await getOrgStats({ baseDir: testBaseDir, fleetDb });
    fleetDb.close();

    expect(stats.activeRateLimitHolds).toHaveLength(1);
    expect(stats.activeRateLimitHolds[0].workerName).toBe('agent-1');
  });
});
