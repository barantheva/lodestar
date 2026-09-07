import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getRepoStats } from './get-repo-stats.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';
import { loadConfig } from '../../../../config/index.ts';

describe('getRepoStats', () => {
  const testBaseDir = path.join(process.cwd(), '.test-repo-stats-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('splits real track counts per configured repo', async () => {
    const service = new PlanningService();
    const ctxA: TaskContext = { trackId: 't1', repo: 'owner/repo-a', issueNumber: 1, issueTitle: 'A', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctxA, 'B', 'analyst');
    await service.generatePlan(ctxA, 'engineer');
    await service.generateEvidence(ctxA, 'ok', 'lead');

    const ctxB: TaskContext = { trackId: 't2', repo: 'owner/repo-b', issueNumber: 2, issueTitle: 'B', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctxB, 'C');

    const config = loadConfig({ GITHUB_TOKEN: 'x', GITHUB_REPO: 'owner/repo-a,owner/repo-b' });
    const data = await getRepoStats({ baseDir: testBaseDir, config });

    expect(data.repos).toHaveLength(2);
    const repoA = data.repos.find(r => r.repo === 'owner/repo-a');
    const repoB = data.repos.find(r => r.repo === 'owner/repo-b');
    expect(repoA?.shipped).toBe(1);
    expect(repoB?.guard1Pending).toBe(1);
  });

  it('shows a repo with zero tracks as a legitimate zero state, not omitted', async () => {
    const config = loadConfig({ GITHUB_TOKEN: 'x', GITHUB_REPO: 'owner/empty-repo' });
    const data = await getRepoStats({ baseDir: testBaseDir, config });

    expect(data.repos).toEqual([{ repo: 'owner/empty-repo', shipped: 0, guard1Pending: 0, inProgress: 0 }]);
  });
});
