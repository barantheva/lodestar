import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runAuditor } from './relay-auditor.ts';
import { PlanningService, type TaskContext } from '../../services/planning-service/index.ts';

describe('runAuditor', () => {
  const testBaseDir = path.join(process.cwd(), '.test-auditor-deck-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('generates the evidence package and validates it as complete', async () => {
    const service = new PlanningService();
    const ctx: TaskContext = {
      trackId: 'track-900',
      repo: 'owner/repo',
      issueNumber: 900,
      issueTitle: 'Fix bug',
      issueBody: 'body',
      baseDir: testBaseDir,
    };

    // Guard 1/2 docs must already exist on disk for completeness validation.
    await service.generateIntent(ctx, 'B', 'analyst');
    await service.generateSpec(ctx, 'B');
    await service.generateDesign(ctx);
    await service.generatePlan(ctx, 'engineer');

    const result = await runAuditor(service, ctx, 'all tests passed', 'lead-bob', {
      verdict: 'PASS',
      reasons: 'clean',
    });

    expect(result.validation.completenessPercent).toBe(100);
    expect(result.evidence.json.stopSlopVerdict).toBe('PASS');
  });
});
