import { describe, expect, it } from 'bun:test';
import { OpenAiAdapter } from './openai-adapter.ts';
import type { AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

function sseResponse(lines: string[], status = 200, headers: Record<string, string> = {}): Response {
  const body = lines.map(l => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status, headers });
}

describe('OpenAiAdapter', () => {
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
        JSON.stringify({ choices: [{ delta: { content: 'Analyzing issue...' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Patch applied successfully.' } }] }),
      ]);

    const adapter = new OpenAiAdapter('fake-key', { fetchImpl: fetchImpl as any });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    expect(events[0].type).toBe('token');
    expect(events[0].content).toContain('Analyzing issue');
    expect(events[events.length - 1].type).toBe('done');
    expect(events[events.length - 1].tokensUsed?.output).toBeGreaterThan(0);
  });

  it('detects HTTP 429 and yields rate_limit event with resumeAt', async () => {
    const fetchImpl = async () => sseResponse([], 429, { 'retry-after': '30' });

    const adapter = new OpenAiAdapter('fake-key', { fetchImpl: fetchImpl as any });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    const rateLimitEvents = events.filter(e => e.type === 'rate_limit');
    expect(rateLimitEvents.length).toBe(1);
    expect(rateLimitEvents[0].resumeAt).toBeGreaterThan(Date.now());
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

    const adapter = new OpenAiAdapter('fake-key', { fetchImpl: fetchImpl as any });
    const iter = adapter.dispatch(task, 'session-to-cancel')[Symbol.asyncIterator]();
    const p = iter.next();

    await adapter.cancel('session-to-cancel');
    await p;

    expect(aborted).toBe(true);
  });
});
