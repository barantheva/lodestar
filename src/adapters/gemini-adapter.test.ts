import { describe, expect, it } from 'bun:test';
import { GeminiAdapter } from './gemini-adapter.ts';
import type { AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

function sseResponse(lines: string[], status = 200, headers: Record<string, string> = {}): Response {
  const body = lines.map(l => `data: ${l}\n\n`).join('');
  return new Response(body, { status, headers });
}

describe('GeminiAdapter', () => {
  const task: AgentTask = {
    taskId: 'task-1',
    trackId: 'track-100',
    repo: 'owner/repo',
    prompt: 'Fix the failing test in math.ts',
    worktreePath: '/tmp/worktree',
  };

  it('dispatches task, streams tokens, and yields done event', async () => {
    const fetchImpl = async () =>
      sseResponse([
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Analyzing codebase...' }] } }] }),
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Fix implemented cleanly.' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
        }),
      ]);

    const adapter = new GeminiAdapter('fake-key', { fetchImpl: fetchImpl as any });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    expect(events[0].type).toBe('token');
    expect(events[0].content).toContain('Analyzing codebase');
    expect(events[events.length - 1].type).toBe('done');
    expect(events[events.length - 1].tokensUsed?.input).toBe(12);
    expect(events[events.length - 1].tokensUsed?.output).toBe(8);
  });

  it('detects HTTP 429 and yields rate_limit event with resumeAt', async () => {
    const fetchImpl = async () => sseResponse([], 429, { 'retry-after': '30' });

    const adapter = new GeminiAdapter('fake-key', { fetchImpl: fetchImpl as any });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    const rateLimitEvents = events.filter(e => e.type === 'rate_limit');
    expect(rateLimitEvents.length).toBe(1);
    expect(rateLimitEvents[0].resumeAt).toBeGreaterThan(Date.now());
    expect(rateLimitEvents[0].resumeAt).toBeLessThanOrEqual(Date.now() + 35_000);
  });

  it('cancels active session by aborting the request', async () => {
    let aborted = false;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      await new Promise<void>((resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return sseResponse([]);
    };

    const adapter = new GeminiAdapter('fake-key', { fetchImpl: fetchImpl as any });
    const iter = adapter.dispatch(task, 'session-to-cancel')[Symbol.asyncIterator]();
    const p = iter.next();

    await adapter.cancel('session-to-cancel');
    await p;

    expect(aborted).toBe(true);
  });
});
