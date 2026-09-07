import * as path from 'node:path';
import { PlanningService, type TaskContext } from '../../services/planning-service/index.ts';
import { validateEvidencePackage, type EvidenceValidationResult } from '../../services/monitor-service/metrics-calculator.ts';

export interface AuditorResult {
  evidence: { markdown: string; json: Record<string, unknown> };
  validation: EvidenceValidationResult;
}

export async function runAuditor(
  planningService: PlanningService,
  taskCtx: TaskContext,
  testOutput: string,
  leadName: string,
  stopSlop?: { verdict: 'PASS' | 'FAIL'; reasons: string }
): Promise<AuditorResult> {
  const evidence = await planningService.generateEvidence(taskCtx, testOutput, leadName, stopSlop);
  const trackDir = path.join(taskCtx.baseDir || process.cwd(), 'flight-deck', 'tracks', taskCtx.trackId);
  const validation = await validateEvidencePackage(taskCtx.trackId, trackDir);

  return { evidence, validation };
}
