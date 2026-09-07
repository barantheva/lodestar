export interface QueueTask<T = unknown> {
  id: string;
  fn: () => Promise<T>;
  priority?: number; // Higher number = higher priority
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  createdAt: number;
}

export interface QueueStatus {
  pending: number;
  running: number;
  concurrency: number;
  isPaused: boolean;
}

export class AsyncQueue {
  private queue: QueueTask<any>[] = [];
  private activeCount: number = 0;
  private concurrency: number;
  private isPaused: boolean = false;
  private drainListeners: Set<() => void> = new Set();

  constructor(concurrency: number = 1) {
    this.concurrency = Math.max(1, concurrency);
  }

  public enqueue<T>(fn: () => Promise<T>, options?: { id?: string; priority?: number }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id: options?.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fn,
        priority: options?.priority || 0,
        resolve,
        reject,
        createdAt: Date.now(),
      };

      this.queue.push(task);
      this.sortQueue();
      this.processNext();
    });
  }

  public setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, concurrency);
    this.processNext();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.processNext();
    }
  }

  public clear(): number {
    const cancelledCount = this.queue.length;
    for (const task of this.queue) {
      task.reject(new Error('Task cancelled: Queue was cleared'));
    }
    this.queue = [];
    return cancelledCount;
  }

  public cancel(taskId: string): boolean {
    const idx = this.queue.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      const [task] = this.queue.splice(idx, 1);
      task.reject(new Error(`Task ${taskId} was cancelled`));
      return true;
    }
    return false;
  }

  public onDrain(callback: () => void): () => void {
    this.drainListeners.add(callback);
    return () => this.drainListeners.delete(callback);
  }

  public getStatus(): QueueStatus {
    return {
      pending: this.queue.length,
      running: this.activeCount,
      concurrency: this.concurrency,
      isPaused: this.isPaused,
    };
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return a.createdAt - b.createdAt;
    });
  }

  private async processNext(): Promise<void> {
    if (this.isPaused || this.activeCount >= this.concurrency || this.queue.length === 0) {
      if (this.activeCount === 0 && this.queue.length === 0) {
        for (const listener of this.drainListeners) {
          try {
            listener();
          } catch (err) {
            console.error('[AsyncQueue] Error in drain listener:', err);
          }
        }
      }
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}
