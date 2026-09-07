import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getRunHistory } from './get-run-history.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';

describe('getRunHistory', () => {
  const testBaseDir = path.join(process.cwd(), '.test-run-history-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('lists only real shipped tracks, excluding ones still in progress', async () => {
    const service = new PlanningService();

    const shipped: TaskContext = { trackId: 't-shipped', repo: 'r', issueNumber: 1, issueTitle: 'Fixed', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(shipped, 'C');
    await service.generateEvidence(shipped, 'ok', 'lead');

    const pending: TaskContext = { trackId: 't-pending', repo: 'r', issueNumber: 2, issueTitle: 'Pending', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(pending, 'A');

    const data = await getRunHistory({ baseDir: testBaseDir });

    expect(data.shippedTracks).toHaveLength(1);
    expect(data.shippedTracks[0].trackId).toBe('t-shipped');
  });
});
