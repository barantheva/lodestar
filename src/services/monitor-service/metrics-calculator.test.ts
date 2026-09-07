import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  calculateCycleTime,
  validateEvidencePackage,
  evaluateRollbackCondition,
} from './metrics-calculator';

describe('MetricsCalculator', () => {
  const testTrackDir = path.join(process.cwd(), '.test-metrics-track-' + Date.now());

  beforeEach(async () => {
    await fs.mkdir(testTrackDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testTrackDir, { recursive: true, force: true });
  });

  it('calculates cycle time and stage latencies accurately', () => {
    const intakeAt = 1000000;
    const routedAt = intakeAt + 2 * 60000;
    const guard1At = routedAt + 5 * 60000;
    const guard2At = guard1At + 8 * 60000;
    const buildPassAt = guard2At + 10 * 60000;
    const verifyPassAt = buildPassAt + 3 * 60000;
    const evidenceGenAt = verifyPassAt + 2 * 60000;
    const guard3At = evidenceGenAt + 4 * 60000;
    const deployedAt = guard3At + 6 * 60000;

    const breakdown = calculateCycleTime({
      intakeAt,
      routedAt,
      guard1At,
      guard2At,
      buildPassAt,
      verifyPassAt,
      evidenceGenAt,
      guard3At,
      deployedAt,
    });

    expect(breakdown.totalCycleTimeMinutes).toBe(40);
    expect(breakdown.stageLatencies.intakeMinutes).toBe(2);
    expect(breakdown.stageLatencies.shapeMinutes).toBe(5);
    expect(breakdown.stageLatencies.planMinutes).toBe(8);
    expect(breakdown.stageLatencies.buildMinutes).toBe(10);
    expect(breakdown.stageLatencies.verifyMinutes).toBe(3);
    expect(breakdown.stageLatencies.leadSignMinutes).toBe(4);
    expect(breakdown.stageLatencies.deployMinutes).toBe(6);
  });

  it('validates evidence package completeness and SHA256 integrity', async () => {
    const trackId = 'track-77';

    // Incomplete package test
    const incomplete = await validateEvidencePackage(trackId, testTrackDir);
    expect(incomplete.validArtifacts).toBe(0);
    expect(incomplete.completenessPercent).toBe(0);
    expect(incomplete.sha256Verified).toBe(false);

    // Create all 5 required artifacts
    await fs.writeFile(path.join(testTrackDir, 'intent.md'), '# Intent');
    await fs.writeFile(path.join(testTrackDir, 'spec.md'), '# Spec');
    await fs.writeFile(path.join(testTrackDir, 'design.md'), '# Design');
    await fs.writeFile(path.join(testTrackDir, 'plan.md'), '# Plan');

    const evidenceContent = '# Evidence Pack\nLead Signature: certified\nPassing tests: 42/42';
    const sha256 = crypto.createHash('sha256').update(evidenceContent).digest('hex');

    await fs.writeFile(path.join(testTrackDir, 'guard-evidence.md'), evidenceContent);
    await fs.writeFile(
      path.join(testTrackDir, 'evidence.json'),
      JSON.stringify({ trackId, sha256, timestamp: Date.now() })
    );

    const complete = await validateEvidencePackage(trackId, testTrackDir);
    expect(complete.validArtifacts).toBe(5);
    expect(complete.completenessPercent).toBe(100);
    expect(complete.sha256Verified).toBe(true);
    expect(complete.leadSignatureValid).toBe(true);
  });

  it('evaluates post-deploy rollback conditions correctly', () => {
    // Healthy metrics
    const healthy = evaluateRollbackCondition({
      trackId: 't1',
      repo: 'org/repo',
      deployedAt: Date.now(),
      observationWindowEnd: Date.now() + 1800000,
      healthCheckFails: 0,
      sentryErrorSpikeCount: 0,
      baselineErrorRate: 0.1,
      currentErrorRate: 0.12,
    });
    expect(healthy.shouldRollback).toBe(false);

    // Health check consecutive failures
    const healthFailed = evaluateRollbackCondition({
      trackId: 't1',
      repo: 'org/repo',
      deployedAt: Date.now(),
      observationWindowEnd: Date.now() + 1800000,
      healthCheckFails: 3,
      sentryErrorSpikeCount: 0,
      baselineErrorRate: 0.1,
      currentErrorRate: 0.1,
    });
    expect(healthFailed.shouldRollback).toBe(true);
    expect(healthFailed.reason).toContain('Health check probe failed');

    // Error spike
    const errorSpike = evaluateRollbackCondition({
      trackId: 't1',
      repo: 'org/repo',
      deployedAt: Date.now(),
      observationWindowEnd: Date.now() + 1800000,
      healthCheckFails: 0,
      sentryErrorSpikeCount: 50,
      baselineErrorRate: 0.5,
      currentErrorRate: 2.5,
    });
    expect(errorSpike.shouldRollback).toBe(true);
    expect(errorSpike.reason).toContain('Error rate spike detected');
  });
});
