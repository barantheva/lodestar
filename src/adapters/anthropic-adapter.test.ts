import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { AnthropicAdapter } from './anthropic-adapter.ts';
import type { AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

describe('AnthropicAdapter', () => {
  it('dispatches task, streams tokens, and yields done event', async () => {
    const mockSpawner: any = () => {
      const ee: any = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.kill = () => {};

      setTimeout(() => {
        ee.stdout.emit('data', Buffer.from('Analyzing codebase...\n'));
        ee.stdout.emit('data', Buffer.from('Fix implemented cleanly.'));
        ee.emit('close', 0);
      }, 20);

      return ee;
    };

    const adapter = new AnthropicAdapter(mockSpawner);
    const task: AgentTask = {
      taskId: 'task-1',
      trackId: 'track-100',
      repo: 'owner/repo',
      prompt: 'Fix the failing test in math.ts',
      worktreePath: '/tmp/worktree',
    };

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].type).toBe('token');
    expect(events[0].content).toContain('Analyzing codebase');
    expect(events[events.length - 1].type).toBe('done');
    expect(events[events.length - 1].tokensUsed?.input).toBeGreaterThan(0);
  });

  it('detects rate limits and yields rate_limit event with resumeAt', async () => {
    const mockSpawner: any = () => {
      const ee: any = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.kill = () => {};

      setTimeout(() => {
        ee.stderr.emit('data', Buffer.from('Error: HTTP 429 rate limit exceeded'));
        ee.emit('close', 1);
      }, 20);

      return ee;
    };

    const adapter = new AnthropicAdapter(mockSpawner);
    const task: AgentTask = {
      taskId: 'task-rate',
      trackId: 'track-rate',
      repo: 'owner/repo',
      prompt: 'Do something',
      worktreePath: '/tmp/worktree',
    };

    const events: AgentEvent[] = [];
    for await (const ev of adapter.dispatch(task)) {
      events.push(ev);
    }

    const rateLimitEvents = events.filter(e => e.type === 'rate_limit');
    expect(rateLimitEvents.length).toBeGreaterThanOrEqual(1);
    expect(rateLimitEvents[0].resumeAt).toBeGreaterThan(Date.now());
  });

  it('cancels active session process', async () => {
    let killed = false;
    const mockSpawner: any = () => {
      const ee: any = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.kill = () => {
        killed = true;
      };
      return ee;
    };

    const adapter = new AnthropicAdapter(mockSpawner);
    const task: AgentTask = {
      taskId: 'task-cancel',
      trackId: 'track-cancel',
      repo: 'owner/repo',
      prompt: 'Long running task',
      worktreePath: '/tmp/worktree',
    };

    const iter = adapter.dispatch(task, 'session-to-cancel')[Symbol.asyncIterator]();
    // Start iterator
    const p = iter.next();

    await adapter.cancel('session-to-cancel');
    expect(killed).toBe(true);
  });
});
