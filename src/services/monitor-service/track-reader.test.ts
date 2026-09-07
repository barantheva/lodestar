import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { listTracks } from './track-reader.ts';
import { PlanningService, type TaskContext } from '../planning-service/index.ts';

describe('listTracks', () => {
  const testBaseDir = path.join(process.cwd(), '.test-track-reader-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('returns an empty list when no tracks directory exists', async () => {
    const tracks = await listTracks(testBaseDir);
    expect(tracks).toEqual([]);
  });

  it('parses a fully-shipped track from its real generated Guard documents', async () => {
    const service = new PlanningService();
    const ctx: TaskContext = {
      trackId: 'track-shipped-1',
      repo: 'owner/repo',
      issueNumber: 42,
      issueTitle: 'Fix the bug',
      issueBody: 'body',
      baseDir: testBaseDir,
    };

    await service.generateIntent(ctx, 'B', 'analyst-dave');
    await service.generateSpec(ctx, 'B');
    await service.generateDesign(ctx);
    await service.generatePlan(ctx, 'engineer-alice');
    await service.generateEvidence(ctx, 'all tests passed', 'lead-bob', { verdict: 'PASS', reasons: 'clean' });

    const tracks = await listTracks(testBaseDir);

    expect(tracks).toHaveLength(1);
    const t = tracks[0];
    expect(t.trackId).toBe('track-shipped-1');
    expect(t.repo).toBe('owner/repo');
    expect(t.issueNumber).toBe(42);
    expect(t.issueTitle).toBe('Fix the bug');
    expect(t.archetype).toBe('B');
    expect(t.status).toBe('shipped');
    expect(t.guard1SignedBy).toBe('analyst-dave');
    expect(t.guard2SignedBy).toBe('engineer-alice');
    expect(t.guard3SignedBy).toBe('lead-bob');
    expect(t.stopSlopVerdict).toBe('PASS');
  });

  it('marks a track with only intent.md as pending Guard 1', async () => {
    const service = new PlanningService();
    const ctx: TaskContext = {
      trackId: 'track-pending-1',
      repo: 'owner/repo',
      issueNumber: 7,
      issueTitle: 'Needs certification',
      issueBody: 'body',
      baseDir: testBaseDir,
    };

    await service.generateIntent(ctx, 'A');

    const tracks = await listTracks(testBaseDir);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].status).toBe('guard1_pending');
  });

  it('marks a track with plan.md but no evidence as in progress', async () => {
    const service = new PlanningService();
    const ctx: TaskContext = {
      trackId: 'track-inprogress-1',
      repo: 'owner/repo',
      issueNumber: 9,
      issueTitle: 'In flight',
      issueBody: 'body',
      baseDir: testBaseDir,
    };

    await service.generateIntent(ctx, 'C');
    await service.generatePlan(ctx, 'engineer-x');

    const tracks = await listTracks(testBaseDir);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].status).toBe('in_progress');
  });
});
