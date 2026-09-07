import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getMemories } from './get-memories.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';

describe('getMemories', () => {
  const testBaseDir = path.join(process.cwd(), '.test-memories-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('lists real tracks with their real Guard sign-off status for the document browser', async () => {
    const service = new PlanningService();
    const ctx: TaskContext = { trackId: 't1', repo: 'owner/repo', issueNumber: 1, issueTitle: 'x', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctx, 'B', 'analyst');
    await service.generatePlan(ctx, 'engineer');
    await service.generateEvidence(ctx, 'ok', 'lead');

    const data = await getMemories({ baseDir: testBaseDir });

    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].guard1SignedBy).toBe('analyst');
    expect(data.tracks[0].guard3SignedBy).toBe('lead');
  });
});
