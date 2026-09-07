import { describe, expect, it } from 'bun:test';
import { AsyncQueue } from './async-queue.ts';

describe('AsyncQueue', () => {
  it('executes tasks respecting concurrency limits', async () => {
    const queue = new AsyncQueue(2);
    const activeHistory: number[] = [];

    const createTask = (ms: number, val: string) => async () => {
      activeHistory.push(queue.getStatus().running);
      await new Promise(r => setTimeout(r, ms));
      return val;
    };

    const p1 = queue.enqueue(createTask(20, 'a'));
    const p2 = queue.enqueue(createTask(20, 'b'));
    const p3 = queue.enqueue(createTask(20, 'c'));

    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual(['a', 'b', 'c']);
    // Concurrency should never exceed 2
    for (const count of activeHistory) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('orders tasks by priority', async () => {
    const queue = new AsyncQueue(1);
    queue.pause(); // Pause so all tasks get queued before running

    const order: string[] = [];

    const p1 = queue.enqueue(async () => order.push('low'), { priority: 0 });
    const p2 = queue.enqueue(async () => order.push('high'), { priority: 10 });
    const p3 = queue.enqueue(async () => order.push('medium'), { priority: 5 });

    queue.resume();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual(['high', 'medium', 'low']);
  });

  it('handles pause, resume, and cancellation', async () => {
    const queue = new AsyncQueue(1);
    queue.pause();

    let executed = false;
    const p1 = queue.enqueue(async () => {
      executed = true;
      return 'ok';
    }, { id: 'task-1' });

    expect(queue.getStatus().isPaused).toBe(true);
    expect(executed).toBe(false);

    // Cancel task
    const cancelled = queue.cancel('task-1');
    expect(cancelled).toBe(true);
    expect(queue.cancel('nonexistent')).toBe(false);

    expect(p1).rejects.toThrow('was cancelled');

    queue.resume();
  });

  it('clears pending tasks and rejects them', async () => {
    const queue = new AsyncQueue(1);
    queue.pause();

    const p1 = queue.enqueue(async () => '1');
    const p2 = queue.enqueue(async () => '2');

    expect(queue.getStatus().pending).toBe(2);
    const count = queue.clear();
    expect(count).toBe(2);
    expect(queue.getStatus().pending).toBe(0);

    expect(p1).rejects.toThrow('cancelled');
    expect(p2).rejects.toThrow('cancelled');
  });

  it('triggers onDrain callback when all tasks finish', async () => {
    const queue = new AsyncQueue(2);
    let drained = false;

    const unsub = queue.onDrain(() => {
      drained = true;
    });

    await queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(drained).toBe(true);
    unsub();
  });
});
