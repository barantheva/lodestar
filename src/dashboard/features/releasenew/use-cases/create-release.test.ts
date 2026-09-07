import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createRelease } from './create-release.ts';
import { ServiceRegistry } from '../../../../core/registry.ts';
import type { Tool } from '../../../../core/interfaces/tool-interface.ts';

describe('createRelease', () => {
  const testBaseDir = path.join(process.cwd(), '.test-do-create-release-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('writes the changelog file to changelogs/ before tagging', async () => {
    let capturedChangelogPath = '';
    const registry = new ServiceRegistry();
    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'release_tag') {
          capturedChangelogPath = args.changelogPath;
          return { success: true, data: { tag: args.tag, status: 'tagged' } };
        }
        return { success: true };
      },
    } as Tool<any, any>);

    await fs.mkdir(testBaseDir, { recursive: true });

    const result = await createRelease(
      { registry, baseDir: testBaseDir },
      { tag: '07-09-2026-abc1234', changelogFilename: 'change-log-07-09-2026-abc1234.md', changelogContent: '## Issues Fixed\n- test' }
    );

    expect(result.success).toBe(true);
    expect(result.tag).toBe('07-09-2026-abc1234');
    expect(capturedChangelogPath).toBe('changelogs/change-log-07-09-2026-abc1234.md');

    const written = await fs.readFile(path.join(testBaseDir, 'changelogs', 'change-log-07-09-2026-abc1234.md'), 'utf-8');
    expect(written).toContain('Issues Fixed');
  });

  it('surfaces a failure without throwing when tagging fails', async () => {
    const registry = new ServiceRegistry();
    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: false, error: 'tag already exists' };
      },
    } as Tool<any, any>);

    await fs.mkdir(testBaseDir, { recursive: true });

    const result = await createRelease(
      { registry, baseDir: testBaseDir },
      { tag: 'dup-tag', changelogFilename: 'change-log-dup-tag.md', changelogContent: 'x' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('tag already exists');
  });
});
