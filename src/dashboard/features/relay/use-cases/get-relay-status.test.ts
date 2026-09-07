import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getRelayStatus } from './get-relay-status.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';

describe('getRelayStatus', () => {
  const testBaseDir = path.join(process.cwd(), '.test-relay-status-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('buckets real tracks into the 6 relay stages by their real Guard status', async () => {
    const service = new PlanningService();

    const shipped: TaskContext = { trackId: 't-shipped', repo: 'r', issueNumber: 1, issueTitle: 'x', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(shipped, 'B', 'analyst');
    await service.generatePlan(shipped, 'engineer');
    await service.generateEvidence(shipped, 'ok', 'lead');

    const pending: TaskContext = { trackId: 't-pending', repo: 'r', issueNumber: 2, issueTitle: 'y', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(pending, 'A');

    const status = await getRelayStatus({ baseDir: testBaseDir });

    expect(status.totalTracks).toBe(2);
    expect(status.shapePending).toBe(1);
    expect(status.shipped).toBe(1);
  });
});
