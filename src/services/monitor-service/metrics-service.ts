import type { EventBus } from '../../core/event-bus.ts';

export interface TrackMetric {
  trackId: string;
  repo: string;
  cycleTimeMs: number;
  evidenceCount: number;
  lead: string;
  deployedAt?: number;
  rolledBack?: boolean;
}

export class MetricsService {
  private metrics: Map<string, TrackMetric> = new Map();
  private guardSignCounts: Map<number, number> = new Map();
  private deployCount = 0;
  private rollbackCount = 0;

  constructor(eventBus: EventBus) {
    eventBus.on('track.shipped', payload => {
      this.metrics.set(payload.trackId, {
        trackId: payload.trackId,
        repo: payload.repo,
        cycleTimeMs: payload.cycleTimeMs,
        evidenceCount: payload.evidenceCount,
        lead: payload.lead,
      });
    });

    eventBus.on('track.deployed', payload => {
      const metric = this.metrics.get(payload.trackId);
      if (metric) metric.deployedAt = payload.deployedAt;
      this.deployCount++;
    });

    eventBus.on('deploy.rollback', payload => {
      const metric = this.metrics.get(payload.trackId);
      if (metric) metric.rolledBack = true;
      this.rollbackCount++;
    });

    eventBus.on('guard.signed', payload => {
      this.guardSignCounts.set(payload.guard, (this.guardSignCounts.get(payload.guard) || 0) + 1);
    });
  }

  public getMetric(trackId: string): TrackMetric | undefined {
    return this.metrics.get(trackId);
  }

  public listMetrics(): TrackMetric[] {
    return [...this.metrics.values()];
  }

  public getGuardSignCount(guard: number): number {
    return this.guardSignCounts.get(guard) || 0;
  }

  public getAverageCycleTimeMs(): number {
    const metrics = this.listMetrics();
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.cycleTimeMs, 0) / metrics.length;
  }

  public getRollbackRatePercent(): number {
    if (this.deployCount === 0) return 0;
    return (this.rollbackCount / this.deployCount) * 100;
  }
}
