import { describe, expect, it } from 'bun:test';
import { runStopSlop } from './relay-stop-slop.ts';
import type { AgentAdapter, AgentEvent } from '../../core/interfaces/agent-interface.ts';

function fakeAdapter(tokens: string[], errorEvent?: string): AgentAdapter {
  return {
    name: 'fake',
    provider: 'fake',
    async *dispatch(): AsyncIterable<AgentEvent> {
      for (const t of tokens) yield { type: 'token', content: t };
      if (errorEvent) yield { type: 'error', error: errorEvent };
    },
    async cancel() {},
  };
}

const ctx = { trackId: 'track-1', repo: 'owner/repo', worktreePath: '/tmp/worktree' };

describe('runStopSlop', () => {
  it('returns PASS when the scan output ends with VERDICT: PASS', async () => {
    const adapter = fakeAdapter(['Reviewed the diff, no slop found.\n', 'VERDICT: PASS']);

    const result = await runStopSlop(adapter, ctx);

    expect(result.verdict).toBe('PASS');
  });

  it('returns FAIL when the scan output ends with VERDICT: FAIL', async () => {
    const adapter = fakeAdapter(['Found a speculative abstraction in foo.ts.\n', 'VERDICT: FAIL']);

    const result = await runStopSlop(adapter, ctx);

    expect(result.verdict).toBe('FAIL');
    expect(result.reasons).toContain('speculative abstraction');
  });

  it('defaults to FAIL when no verdict marker is present, rather than silently passing', async () => {
    const adapter = fakeAdapter(['I looked at the code.']);

    const result = await runStopSlop(adapter, ctx);

    expect(result.verdict).toBe('FAIL');
  });

  it('defaults to FAIL when the adapter errors', async () => {
    const adapter = fakeAdapter([], 'connection reset');

    const result = await runStopSlop(adapter, ctx);

    expect(result.verdict).toBe('FAIL');
    expect(result.reasons).toContain('connection reset');
  });

  it('includes prior learnings in the scan prompt when provided', async () => {
    let capturedPrompt = '';
    const adapter: AgentAdapter = {
      name: 'fake',
      provider: 'fake',
      async *dispatch(task) {
        capturedPrompt = task.prompt;
        yield { type: 'token', content: 'VERDICT: PASS' };
      },
      async cancel() {},
    };

    await runStopSlop(adapter, { ...ctx, learnings: 'Recurring issue: unused try/catch fallbacks.' });

    expect(capturedPrompt).toContain('Recurring issue: unused try/catch fallbacks.');
  });
});
