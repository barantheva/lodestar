import type { Tool } from '../../core/interfaces/tool-interface.ts';
import type { EventBus } from '../../core/event-bus.ts';
import type { TrackEngine } from '../../core/engine.ts';
import { readWorkflowConfig } from './workflow-config.ts';

export interface DeployContext {
  trackId: string;
  repo: string;
  worktreePath: string;
  commitHash: string;
  baseDir?: string;
}

export interface DeployDeps {
  codeExecTool: Tool<any, any>;
  eventBus: EventBus;
}

export interface DeployOutcome {
  deployed: boolean;
  skipped?: boolean;
  error?: string;
}

export async function runOptInDeploy(deps: DeployDeps, ctx: DeployContext): Promise<DeployOutcome> {
  const workflow = await readWorkflowConfig(ctx.baseDir);
  if (!workflow.deploy) {
    return { deployed: false, skipped: true };
  }

  const res = await deps.codeExecTool.execute({ command: workflow.deploy, cwd: ctx.worktreePath });
  if (!res.success) {
    return { deployed: false, error: res.error };
  }

  await deps.eventBus.emit('track.deployed', { trackId: ctx.trackId, repo: ctx.repo, deployedAt: Date.now() });
  return { deployed: true };
}

export interface RollbackContext {
  trackId: string;
  repo: string;
  worktreePath: string;
  commitHash: string;
  reason: string;
  baseDir?: string;
}

export interface RollbackDeps {
  gitTool: Tool<any, any>;
  codeExecTool: Tool<any, any>;
  eventBus: EventBus;
  engine: Pick<TrackEngine, 'executeTrack'>;
}

export interface RollbackOutcome {
  reverted: boolean;
  remediationTrackId?: string;
  error?: string;
}

export async function performRollback(deps: RollbackDeps, ctx: RollbackContext): Promise<RollbackOutcome> {
  const revertRes = await deps.gitTool.execute({ action: 'revert', commitHash: ctx.commitHash }, { worktreePath: ctx.worktreePath });
  if (!revertRes.success) {
    return { reverted: false, error: revertRes.error };
  }

  const revertedCommit = revertRes.data?.commitHash || ctx.commitHash;

  const workflow = await readWorkflowConfig(ctx.baseDir);
  if (workflow.rollback) {
    await deps.codeExecTool.execute({ command: workflow.rollback, cwd: ctx.worktreePath });
  }

  await deps.eventBus.emit('deploy.rollback', {
    trackId: ctx.trackId,
    repo: ctx.repo,
    reason: ctx.reason,
    revertedCommit,
  });

  const remediationTrackId = `track_${ctx.trackId}_remediation_${Date.now()}`;
  const remediationResult = await deps.engine.executeTrack({
    trackId: remediationTrackId,
    repo: ctx.repo,
    issueNumber: 0,
    issueTitle: `Remediate rollback of ${ctx.trackId}`,
    issueBody: `Automated post-deploy rollback triggered: ${ctx.reason}\n\nReverted commit: ${revertedCommit}`,
    archetype: 'H',
    baseDir: ctx.baseDir,
  });

  return { reverted: true, remediationTrackId: remediationResult.trackId };
}
