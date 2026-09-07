import { describe, expect, it } from 'bun:test';
import { SseHub } from './sse-hub.ts';
import { EventBus } from '../core/event-bus.ts';

describe('SseHub', () => {
  it('broadcasts event bus activity to subscribed clients', async () => {
    const eventBus = new EventBus();
    const hub = new SseHub(eventBus);

    const received: string[] = [];
    hub.subscribe(data => received.push(data));

    await eventBus.emit('worker.heartbeat', { workerName: 'agent-1', rssMb: 10, cpuPct: 1 });

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0])).toEqual({ type: 'worker.heartbeat', payload: { workerName: 'agent-1', rssMb: 10, cpuPct: 1 } });
  });

  it('stops sending to a client after it unsubscribes', async () => {
    const eventBus = new EventBus();
    const hub = new SseHub(eventBus);

    const received: string[] = [];
    const unsubscribe = hub.subscribe(data => received.push(data));
    unsubscribe();

    await eventBus.emit('worker.heartbeat', { workerName: 'agent-1', rssMb: 10, cpuPct: 1 });

    expect(received).toHaveLength(0);
  });
});
