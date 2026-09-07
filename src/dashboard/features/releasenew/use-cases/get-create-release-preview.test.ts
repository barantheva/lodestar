import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getCreateReleasePreview } from './get-create-release-preview.ts';
import { ServiceRegistry } from '../../../../core/registry.ts';
import { PlanningService, type TaskContext } from '../../../../services/planning-service/index.ts';
import type { Tool } from '../../../../core/interfaces/tool-interface.ts';

function fakeGitTool(headSha: string, tags: any[]): Tool<any, any> {
  return {
    name: 'git',
    description: '',
    parameters: { type: 'object', properties: {} },
    async execute(args) {
      if (args.action === 'head_sha') return { success: true, data: { commitHash: headSha } };
      if (args.action === 'list_tags') return { success: true, data: { tags } };
      return { success: true };
    },
  };
}

describe('getCreateReleasePreview', () => {
  const testBaseDir = path.join(process.cwd(), '.test-create-release-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('computes a deterministic tag and changelog filename from the real HEAD sha', async () => {
    const registry = new ServiceRegistry();
    registry.registerTool(fakeGitTool('a1b2c3d', []));

    const preview = await getCreateReleasePreview({ registry, baseDir: testBaseDir });

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    expect(preview.tag).toBe(`${day}-${month}-${year}-a1b2c3d`);
    expect(preview.changelogFilename).toBe(`change-log-${preview.tag}.md`);
  });

  it('lists real shipped tracks since the last tag for the changelog draft', async () => {
    const registry = new ServiceRegistry();
    registry.registerTool(fakeGitTool('a1b2c3d', [{ tag: 'old-tag', commit: 'old', createdAt: new Date(Date.now() - 100_000).toISOString() }]));

    const service = new PlanningService();
    const ctx: TaskContext = { trackId: 't1', repo: 'owner/repo', issueNumber: 1, issueTitle: 'Fixed thing', issueBody: 'b', baseDir: testBaseDir };
    await service.generateIntent(ctx, 'C');
    await service.generatePlan(ctx, 'engineer');
    await service.generateEvidence(ctx, 'ok', 'lead');

    const preview = await getCreateReleasePreview({ registry, baseDir: testBaseDir });

    expect(preview.sinceLastTag).toHaveLength(1);
    expect(preview.sinceLastTag[0].trackId).toBe('t1');
    expect(preview.lastTag?.tag).toBe('old-tag');
  });
});
