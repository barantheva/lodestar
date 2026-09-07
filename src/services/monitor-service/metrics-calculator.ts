import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface TrackTimestamps {
  intakeAt: number;
  routedAt?: number;
  guard1At?: number;
  guard2At?: number;
  buildPassAt?: number;
  verifyPassAt?: number;
  evidenceGenAt?: number;
  guard3At: number;
  deployedAt?: number;
}

export interface CycleTimeBreakdown {
  totalCycleTimeMs: number;
  totalCycleTimeMinutes: number;
  stageLatencies: {
    intakeMinutes: number;
    shapeMinutes: number;
    planMinutes: number;
    buildMinutes: number;
    verifyMinutes: number;
    leadSignMinutes: number;
    deployMinutes: number;
  };
}

export function calculateCycleTime(ts: TrackTimestamps): CycleTimeBreakdown {
  const finalTimestamp = ts.deployedAt || ts.guard3At;
  const totalMs = Math.max(0, finalTimestamp - ts.intakeAt);
  return {
    totalCycleTimeMs: totalMs,
    totalCycleTimeMinutes: Math.round((totalMs / 60000) * 10) / 10,
    stageLatencies: {
      intakeMinutes: Math.max(0, Math.round(((ts.routedAt || ts.intakeAt) - ts.intakeAt) / 60000)),
      shapeMinutes: Math.max(0, Math.round(((ts.guard1At || ts.intakeAt) - (ts.routedAt || ts.intakeAt)) / 60000)),
      planMinutes: Math.max(0, Math.round(((ts.guard2At || ts.guard1At || ts.intakeAt) - (ts.guard1At || ts.intakeAt)) / 60000)),
      buildMinutes: Math.max(0, Math.round(((ts.buildPassAt || ts.guard2At || ts.intakeAt) - (ts.guard2At || ts.intakeAt)) / 60000)),
      verifyMinutes: Math.max(0, Math.round(((ts.verifyPassAt || ts.buildPassAt || ts.intakeAt) - (ts.buildPassAt || ts.intakeAt)) / 60000)),
      leadSignMinutes: Math.max(0, Math.round((ts.guard3At - (ts.evidenceGenAt || ts.verifyPassAt || ts.intakeAt)) / 60000)),
      deployMinutes: ts.deployedAt ? Math.max(0, Math.round((ts.deployedAt - ts.guard3At) / 60000)) : 0,
    },
  };
}

export interface EvidenceValidationResult {
  trackId: string;
  totalArtifacts: number;
  validArtifacts: number;
  completenessPercent: number;
  artifacts: {
    intent: boolean;
    spec: boolean;
    design: boolean;
    plan: boolean;
    evidencePack: boolean;
  };
  sha256Verified: boolean;
  leadSignatureValid: boolean;
}

export async function validateEvidencePackage(trackId: string, trackDir: string): Promise<EvidenceValidationResult> {
  const files = {
    intent: false,
    spec: false,
    design: false,
    plan: false,
    evidencePack: false,
  };

  try {
    const entries = await fs.readdir(trackDir);
    if (entries.includes('intent.md')) files.intent = true;
    if (entries.includes('spec.md')) files.spec = true;
    if (entries.includes('design.md')) files.design = true;
    if (entries.includes('plan.md')) files.plan = true;
    if (entries.includes('guard-evidence.md') && entries.includes('evidence.json')) {
      files.evidencePack = true;
    }
  } catch {
    // Directory might not exist
  }

  let leadSignatureValid = false;
  let sha256Verified = false;

  try {
    const evidencePath = path.join(trackDir, 'guard-evidence.md');
    const content = await fs.readFile(evidencePath, 'utf-8');
    if (content.includes('Lead Signature: certified') || content.includes('<!-- signedBy: lead')) {
      leadSignatureValid = true;
    }

    const jsonPath = path.join(trackDir, 'evidence.json');
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const json = JSON.parse(jsonContent);
    if (json.sha256 && json.trackId === trackId) {
      const calculated = crypto.createHash('sha256').update(content).digest('hex');
      if (json.sha256 === calculated) {
        sha256Verified = true;
      }
    }
  } catch {
    // files missing or invalid
  }

  const validCount = Object.values(files).filter(Boolean).length;

  return {
    trackId,
    totalArtifacts: 5,
    validArtifacts: validCount,
    completenessPercent: (validCount / 5) * 100,
    artifacts: files,
    sha256Verified,
    leadSignatureValid,
  };
}

export interface PostDeployTelemetry {
  trackId: string;
  repo: string;
  deployedAt: number;
  observationWindowEnd: number;
  healthCheckFails: number;
  sentryErrorSpikeCount: number;
  baselineErrorRate: number;
  currentErrorRate: number;
}

export function evaluateRollbackCondition(metrics: PostDeployTelemetry): { shouldRollback: boolean; reason?: string } {
  if (metrics.healthCheckFails >= 3) {
    return { shouldRollback: true, reason: 'Health check probe failed 3 consecutive attempts post-deploy.' };
  }
  if (metrics.currentErrorRate > Math.max(1.0, metrics.baselineErrorRate * 3)) {
    return {
      shouldRollback: true,
      reason: `Error rate spike detected: ${metrics.currentErrorRate}% exceeds baseline threshold.`,
    };
  }
  return { shouldRollback: false };
}
