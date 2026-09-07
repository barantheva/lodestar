import { describe, expect, it } from 'bun:test';
import { EventBus, globalEventBus } from './event-bus.ts';

describe('EventBus', () => {
  it('registers listener and receives emitted typed events', async () => {
    const bus = new EventBus();
    const received: any[] = [];

    const unsubscribe = bus.on('track.opened', payload => {
      received.push(payload);
    });

    await bus.emit('track.opened', {
      trackId: 'track-101',
      archetype: 'A',
      jobType: 'issue-monitor',
      repo: 'owner/repo',
    });

    expect(received).toHaveLength(1);
    expect(received[0].trackId).toBe('track-101');
    expect(received[0].archetype).toBe('A');

    unsubscribe();

    await bus.emit('track.opened', {
      trackId: 'track-102',
      archetype: 'B',
      jobType: 'issue-monitor',
    });

    expect(received).toHaveLength(1);
  });

  it('supports wildcard listeners (onAny)', async () => {
    const bus = new EventBus();
    const events: { type: string; payload: any }[] = [];

    const unsubscribe = bus.onAny((type, payload) => {
      events.push({ type, payload });
    });

    await bus.emit('guard.signed', {
      trackId: 'track-200',
      guard: 1,
      signedBy: 'analyst-1',
    });

    await bus.emit('rate_limit.hit', {
      workerName: 'agent-1',
      provider: 'claude',
      resumeAt: 1725700000,
    });

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('guard.signed');
    expect(events[1].type).toBe('rate_limit.hit');

    unsubscribe();
    await bus.emit('rate_limit.resumed', { workerName: 'agent-1' });
    expect(events).toHaveLength(2);
  });

  it('handles async subscribers and isolates listener errors', async () => {
    const bus = new EventBus();
    let handled = false;

    bus.on('pr.opened', () => {
      throw new Error('Simulated synchronous crash in subscriber');
    });

    bus.on('pr.opened', async () => {
      await new Promise(r => setTimeout(r, 10));
      handled = true;
    });

    bus.onAny(() => {
      throw new Error('Simulated wildcard sync error');
    });

    bus.onAny(async () => {
      throw new Error('Simulated wildcard async error');
    });

    await bus.emit('pr.opened', {
      trackId: 'track-300',
      repo: 'org/repo',
      prUrl: 'https://github.com/org/repo/pull/1',
    });

    expect(handled).toBe(true);
  });

  it('clears all listeners and returns correct listener counts', () => {
    const bus = new EventBus();
    expect(bus.listenerCount()).toBe(0);

    const cb1 = () => {};
    const cb2 = () => {};

    bus.on('track.shipped', cb1);
    bus.on('track.shipped', cb2);
    bus.onAny(() => {});

    expect(bus.listenerCount('track.shipped')).toBe(3); // 2 specific + 1 wildcard
    expect(bus.listenerCount()).toBe(3);

    bus.off('track.shipped', cb1);
    expect(bus.listenerCount('track.shipped')).toBe(2);

    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });

  it('verifies globalEventBus singleton instance exists', () => {
    expect(globalEventBus).toBeDefined();
    expect(typeof globalEventBus.emit).toBe('function');
  });
});
