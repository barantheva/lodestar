export type EventBusEventType =
  | 'track.opened'
  | 'guard.signed'
  | 'guard.rejected'
  | 'pipeline.stage'
  | 'rate_limit.hit'
  | 'rate_limit.resumed'
  | 'pr.opened'
  | 'pr.updated'
  | 'track.shipped'
  | 'track.deployed'
  | 'deploy.rollback'
  | 'worker.heartbeat'
  | 'metric.updated'
  | 'behavior.anomaly_detected'
  | 'behavior.issue_created';

export type EventPayloads = {
  'track.opened': { trackId: string; archetype: 'A' | 'B' | 'C' | 'H'; jobType: string; repo?: string };
  'guard.signed': { trackId: string; guard: 1 | 2 | 3; signedBy: string; repo?: string };
  'guard.rejected': { trackId: string; guard: 3; reason?: string };
  'pipeline.stage': {
    trackId: string;
    stage: 'relay-implementer' | 'relay-stop-slop' | 'relay-reviewer' | 'relay-auditor';
    verdict?: 'PASS' | 'FAIL' | 'REVIEW_PASS' | 'BLOCK';
  };
  'rate_limit.hit': { workerName: string; provider: string; resumeAt: number };
  'rate_limit.resumed': { workerName: string };
  'pr.opened': { trackId: string; repo: string; prUrl: string; prNumber?: number };
  'pr.updated': { trackId: string; repo: string; prUrl: string; prNumber?: number };
  'track.shipped': { trackId: string; repo: string; cycleTimeMs: number; evidenceCount: number; lead: string };
  'track.deployed': { trackId: string; repo: string; deployedAt: number };
  'deploy.rollback': { trackId: string; repo: string; reason: string; revertedCommit: string };
  'worker.heartbeat': { workerName: string; rssMb: number; cpuPct: number };
  'metric.updated': { metric: string; value: unknown };
  'behavior.anomaly_detected': {
    repo: string;
    frictionType: string;
    url: string;
    selector?: string;
    metrics: Record<string, number>;
  };
  'behavior.issue_created': {
    repo: string;
    issueNumber: number;
    issueUrl: string;
    frictionType: string;
  };
};

export type EventCallback<T extends EventBusEventType> = (payload: EventPayloads[T]) => void | Promise<void>;
export type WildcardCallback = (type: EventBusEventType, payload: unknown) => void | Promise<void>;

export class EventBus {
  private listeners: Map<EventBusEventType, Set<EventCallback<any>>> = new Map();
  private wildcardListeners: Set<WildcardCallback> = new Set();

  public on<T extends EventBusEventType>(event: T, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  public off<T extends EventBusEventType>(event: T, callback: EventCallback<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public onAny(callback: WildcardCallback): () => void {
    this.wildcardListeners.add(callback);
    return () => {
      this.wildcardListeners.delete(callback);
    };
  }

  public async emit<T extends EventBusEventType>(event: T, payload: EventPayloads[T]): Promise<void> {
    const promises: Promise<void>[] = [];

    const specificListeners = this.listeners.get(event);
    if (specificListeners) {
      for (const listener of specificListeners) {
        try {
          const res = listener(payload);
          if (res instanceof Promise) {
            promises.push(res.catch(err => console.error(`[EventBus] Error in listener for ${event}:`, err)));
          }
        } catch (err) {
          console.error(`[EventBus] Sync error in listener for ${event}:`, err);
        }
      }
    }

    for (const wildcard of this.wildcardListeners) {
      try {
        const res = wildcard(event, payload);
        if (res instanceof Promise) {
          promises.push(res.catch(err => console.error(`[EventBus] Error in wildcard listener for ${event}:`, err)));
        }
      } catch (err) {
        console.error(`[EventBus] Sync error in wildcard listener for ${event}:`, err);
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  public clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  public listenerCount(event?: EventBusEventType): number {
    if (event) {
      return (this.listeners.get(event)?.size || 0) + this.wildcardListeners.size;
    }
    let total = this.wildcardListeners.size;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}

export const globalEventBus = new EventBus();
