import { describe, expect, it } from 'bun:test';
import { runReviewer } from './relay-reviewer.ts';
import type { Tool, ToolResult } from '../../core/interfaces/tool-interface.ts';
import type { CodeExecArgs, CodeExecOutput } from '../tools/code-exec-tool.ts';

function fakeCodeExecTool(result: ToolResult<CodeExecOutput>): Tool<CodeExecArgs, CodeExecOutput> {
  return {
    name: 'code-exec',
    description: 'fake',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return result;
    },
  };
}

describe('runReviewer', () => {
  it('returns PASS when the test command succeeds', async () => {
    const tool = fakeCodeExecTool({
      success: true,
      data: { stdout: 'all tests passed', stderr: '', exitCode: 0, durationMs: 10 },
    });

    const result = await runReviewer(tool, 'bun test', '/tmp/worktree');

    expect(result.verdict).toBe('PASS');
    expect(result.stdout).toBe('all tests passed');
  });

  it('returns FAIL when the test command fails', async () => {
    const tool = fakeCodeExecTool({
      success: false,
      error: 'Command exited with non-zero code 1',
      data: { stdout: '', stderr: '1 test failed', exitCode: 1, durationMs: 10 },
    });

    const result = await runReviewer(tool, 'bun test', '/tmp/worktree');

    expect(result.verdict).toBe('FAIL');
    expect(result.error).toContain('non-zero code 1');
    expect(result.stderr).toBe('1 test failed');
  });
});
