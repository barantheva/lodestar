import { describe, expect, it } from 'bun:test';
import { getReleases } from './get-releases.ts';
import { ServiceRegistry } from '../../../../core/registry.ts';
import type { Tool } from '../../../../core/interfaces/tool-interface.ts';

describe('getReleases', () => {
  it('lists real tags from git-tool, newest first', async () => {
    const registry = new ServiceRegistry();
    const gitTool: Tool<any, any> = {
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args) {
        expect(args.action).toBe('list_tags');
        return {
          success: true,
          data: {
            tags: [
              { tag: '07-09-2026-a1b2c3d', commit: 'a1b2c3d', createdAt: '2026-09-07T14:10:00+00:00' },
              { tag: '05-09-2026-9e0f1a2', commit: '9e0f1a2', createdAt: '2026-09-05T09:22:00+00:00' },
            ],
          },
        };
      },
    };
    registry.registerTool(gitTool);

    const releases = await getReleases({ registry, baseDir: '/tmp/repo' });

    expect(releases.tags).toHaveLength(2);
    expect(releases.tags[0].tag).toBe('07-09-2026-a1b2c3d');
    expect(releases.repoPath).toBe('/tmp/repo');
  });

  it('returns an empty list when no tags exist yet, without throwing', async () => {
    const registry = new ServiceRegistry();
    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true, data: { tags: [] } };
      },
    });

    const releases = await getReleases({ registry, baseDir: '/tmp/repo' });
    expect(releases.tags).toEqual([]);
  });
});
