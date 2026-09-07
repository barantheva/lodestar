import { describe, expect, it } from 'bun:test';
import { runImplementer } from './relay-implementer.ts';
import type { AgentAdapter, AgentEvent, AgentTask } from '../../core/interfaces/agent-interface.ts';

function fakeAdapter(events: AgentEvent[]): AgentAdapter {
  return {
    name: 'fake',
    provider: 'fake',
    async *dispatch(): AsyncIterable<AgentEvent> {
      for (const e of events) yield e;
    },
    async cancel() {},
  };
}

const task: AgentTask = {
  taskId: 't1',
  trackId: 'track-1',
  repo: 'owner/repo',
  prompt: 'Fix the bug',
  worktreePath: '/tmp/worktree',
};

describe('runImplementer', () => {
  it('returns success when the adapter completes without error', async () => {
    const adapter = fakeAdapter([
      { type: 'token', content: 'working...' },
      { type: 'done', tokensUsed: { input: 5, output: 5 } },
    ]);

    const result = await runImplementer(adapter, task);

    expect(result.success).toBe(true);
  });

  it('surfaces a rate_limit event as a non-success result carrying resumeAt', async () => {
    const resumeAt = Date.now() + 60_000;
    const adapter = fakeAdapter([{ type: 'rate_limit', resumeAt }]);

    const result = await runImplementer(adapter, task);

    expect(result.success).toBe(false);
    expect(result.rateLimited?.provider).toBe('fake');
    expect(result.rateLimited?.resumeAt).toBe(resumeAt);
  });

  it('surfaces an error event as a non-success result carrying the error message', async () => {
    const adapter = fakeAdapter([{ type: 'error', error: 'boom' }]);

    const result = await runImplementer(adapter, task);

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
