import { describe, expect, it } from 'bun:test';
import { MetricsService } from './metrics-service.ts';
import { EventBus } from '../../core/event-bus.ts';

describe('MetricsService', () => {
  it('records a track metric on track.shipped without polling', async () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    await eventBus.emit('track.shipped', { trackId: 't1', repo: 'owner/repo', cycleTimeMs: 120_000, evidenceCount: 5, lead: 'lead-bob' });

    const metric = service.getMetric('t1');
    expect(metric?.repo).toBe('owner/repo');
    expect(metric?.cycleTimeMs).toBe(120_000);
    expect(metric?.evidenceCount).toBe(5);
    expect(metric?.lead).toBe('lead-bob');
  });

  it('attaches deployedAt to an existing track metric on track.deployed', async () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    await eventBus.emit('track.shipped', { trackId: 't1', repo: 'owner/repo', cycleTimeMs: 60_000, evidenceCount: 5, lead: 'lead-bob' });
    await eventBus.emit('track.deployed', { trackId: 't1', repo: 'owner/repo', deployedAt: 1700000000000 });

    expect(service.getMetric('t1')?.deployedAt).toBe(1700000000000);
  });

  it('records a rollback against its track and counts toward the rollback rate', async () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    await eventBus.emit('track.shipped', { trackId: 't1', repo: 'owner/repo', cycleTimeMs: 60_000, evidenceCount: 5, lead: 'lead-bob' });
    await eventBus.emit('track.deployed', { trackId: 't1', repo: 'owner/repo', deployedAt: 1 });
    await eventBus.emit('deploy.rollback', { trackId: 't1', repo: 'owner/repo', reason: 'health check failed', revertedCommit: 'abc' });

    expect(service.getMetric('t1')?.rolledBack).toBe(true);
    expect(service.getRollbackRatePercent()).toBe(100);
  });

  it('tallies guard.signed events by guard number without polling', async () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    await eventBus.emit('guard.signed', { trackId: 't1', guard: 1, signedBy: 'analyst' });
    await eventBus.emit('guard.signed', { trackId: 't2', guard: 1, signedBy: 'auto-bypass' });
    await eventBus.emit('guard.signed', { trackId: 't1', guard: 3, signedBy: 'lead' });

    expect(service.getGuardSignCount(1)).toBe(2);
    expect(service.getGuardSignCount(3)).toBe(1);
    expect(service.getGuardSignCount(2)).toBe(0);
  });

  it('computes the average cycle time across all shipped tracks', async () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    await eventBus.emit('track.shipped', { trackId: 't1', repo: 'r', cycleTimeMs: 100_000, evidenceCount: 5, lead: 'l' });
    await eventBus.emit('track.shipped', { trackId: 't2', repo: 'r', cycleTimeMs: 200_000, evidenceCount: 5, lead: 'l' });

    expect(service.getAverageCycleTimeMs()).toBe(150_000);
  });

  it('returns zero rollback rate and zero average cycle time when nothing has shipped yet', () => {
    const eventBus = new EventBus();
    const service = new MetricsService(eventBus);

    expect(service.getRollbackRatePercent()).toBe(0);
    expect(service.getAverageCycleTimeMs()).toBe(0);
    expect(service.listMetrics()).toEqual([]);
  });
});
