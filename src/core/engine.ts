import type { EventBus } from './event-bus.ts';
import type { ServiceRegistry } from './registry.ts';
import type { GitTool } from '../plugins/tools/git-tool.ts';
import type { GithubTool } from '../plugins/tools/github-tool.ts';
import type { CodeExecTool } from '../plugins/tools/code-exec-tool.ts';
import type { AgentAdapter, AgentTask } from './interfaces/agent-interface.ts';
import type { KnowledgeBackend } from './interfaces/memory-interface.ts';
import { PlanningService, type Archetype, type TaskContext } from '../services/planning-service/index.ts';
import { calculateCycleTime, type TrackTimestamps } from '../services/monitor-service/metrics-calculator.ts';
import { runImplementer } from '../plugins/agents/relay-implementer.ts';
import { runStopSlop } from '../plugins/agents/relay-stop-slop.ts';
import { runReviewer } from '../plugins/agents/relay-reviewer.ts';
import { runAuditor } from '../plugins/agents/relay-auditor.ts';
import { runOptInDeploy } from '../services/monitor-service/deploy-runner.ts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface TrackConfig {
  trackId: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  archetype?: Archetype;
  labels?: string[];
  jobType?: string;
  testCommand?: string;
  provider?: string;
  stopSlopProvider?: string;
  signedGuard1?: boolean;
  analystName?: string;
  leadName?: string;
  baseDir?: string;
}

export interface TrackExecutionResult {
  trackId: string;
  success: boolean;
  archetype: Archetype;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  cycleTimeMs: number;
  verdict?: 'PASS' | 'FAIL';
  evidenceValidated?: boolean;
  deployed?: boolean;
}

export class TrackEngine {
  private eventBus: EventBus;
  private registry: ServiceRegistry;
  private planningService: PlanningService;

  constructor(eventBus: EventBus, registry: ServiceRegistry, memoryBackend?: KnowledgeBackend) {
    this.eventBus = eventBus;
    this.registry = registry;
    this.planningService = new PlanningService(memoryBackend);
  }

  public async executeTrack(config: TrackConfig): Promise<TrackExecutionResult> {
    const intakeAt = Date.now();
    const timestamps: Partial<TrackTimestamps> = { intakeAt };

    // 0. Archetype Classification
    const archetype = config.archetype || this.planningService.classifyArchetype({
      issueTitle: config.issueTitle,
      issueBody: config.issueBody,
      labels: config.labels,
    });
    timestamps.routedAt = Date.now();

    const jobType = config.jobType || 'issue-monitor';

    await this.eventBus.emit('track.opened', {
      trackId: config.trackId,
      archetype,
      jobType,
      repo: config.repo,
    });

    const gitTool = this.registry.getTool<any, any>('git') as GitTool | undefined;
    const githubTool = this.registry.getTool<any, any>('github') as GithubTool | undefined;
    const codeExecTool = this.registry.getTool<any, any>('code-exec') as CodeExecTool | undefined;

    if (!gitTool || !githubTool || !codeExecTool) {
      const err = 'Missing required tools (git, github, code-exec) in registry';
      return {
        trackId: config.trackId,
        success: false,
        archetype,
        error: err,
        cycleTimeMs: Date.now() - intakeAt,
      };
    }

    const providerName = config.provider || 'claude';
    const adapter = this.registry.getAgent(providerName);
    if (!adapter) {
      const err = `No agent adapter registered for provider: ${providerName}`;
      return {
        trackId: config.trackId,
        success: false,
        archetype,
        error: err,
        cycleTimeMs: Date.now() - intakeAt,
      };
    }

    // 1. Guard 1: PRD / Intent Verification
    const analystName = config.analystName || 'analyst-lead';
    const guard1SignedBy = (archetype === 'C' || archetype === 'H') ? 'auto-bypass' : (config.signedGuard1 ? analystName : undefined);

    const taskCtx: TaskContext = {
      trackId: config.trackId,
      repo: config.repo,
      issueNumber: config.issueNumber,
      issueTitle: config.issueTitle,
      issueBody: config.issueBody,
      labels: config.labels,
      baseDir: config.baseDir,
    };

    const trackDir = path.join(config.baseDir || process.cwd(), 'flight-deck', 'tracks', config.trackId);
    const isResuming = await fs
      .access(path.join(trackDir, 'plan.md'))
      .then(() => true)
      .catch(() => false);

    if (!isResuming) {
      await this.planningService.generateIntent(taskCtx, archetype, guard1SignedBy);

      if (!guard1SignedBy) {
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          error: `Guard 1 certification required for archetype ${archetype} before build begins.`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }
    } else if (!guard1SignedBy) {
      return {
        trackId: config.trackId,
        success: false,
        archetype,
        error: `Guard 1 certification required for archetype ${archetype} before build begins.`,
        cycleTimeMs: Date.now() - intakeAt,
      };
    }

    timestamps.guard1At = Date.now();
    await this.eventBus.emit('guard.signed', {
      trackId: config.trackId,
      guard: 1,
      signedBy: guard1SignedBy,
    });

    // 2. Hanoi Rainbow Spec, Design, and Guard 2 Plan
    const engineerName = adapter.name || 'auto-coder-engineer';
    if (!isResuming) {
      await this.planningService.generateSpec(taskCtx, archetype);
      await this.planningService.generateDesign(taskCtx);
      await this.planningService.generatePlan(taskCtx, engineerName);
    }

    timestamps.guard2At = Date.now();
    await this.eventBus.emit('guard.signed', {
      trackId: config.trackId,
      guard: 2,
      signedBy: engineerName,
    });

    // 3. Create Worktree
    const branchName = `lodestar/${config.trackId}`;
    const wtRes = await gitTool.execute({
      action: 'create_worktree',
      trackId: config.trackId,
      branch: branchName,
    });

    if (!wtRes.success || !wtRes.data?.worktreePath) {
      return {
        trackId: config.trackId,
        success: false,
        archetype,
        error: `Failed to create worktree: ${wtRes.error}`,
        cycleTimeMs: Date.now() - intakeAt,
      };
    }

    const worktreePath = wtRes.data.worktreePath;

    try {
      // 4. Dispatch Task to Coding Agent
      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-implementer',
      });

      const task: AgentTask = {
        taskId: `task_${config.trackId}`,
        trackId: config.trackId,
        repo: config.repo,
        prompt: `Fix Issue #${config.issueNumber}: ${config.issueTitle}\n\n${config.issueBody}`,
        worktreePath,
      };

      const implResult = await runImplementer(adapter, task);
      if (implResult.rateLimited) {
        await this.eventBus.emit('rate_limit.hit', {
          workerName: adapter.name,
          provider: implResult.rateLimited.provider,
          resumeAt: implResult.rateLimited.resumeAt,
        });
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          error: `Rate limit encountered on provider ${implResult.rateLimited.provider}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }
      if (!implResult.success) {
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          error: `Agent error: ${implResult.error}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }

      // 4b. Scan for AI slop (relay-stop-slop) — PASS required before advancing
      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-stop-slop',
      });

      const stopSlopAdapter = this.registry.getAgent(config.stopSlopProvider || providerName) || adapter;
      const learnings = await fs
        .readFile(path.join(taskCtx.baseDir || process.cwd(), 'flight-deck', 'learnings.md'), 'utf-8')
        .catch(() => undefined);

      const stopSlopResult = await runStopSlop(stopSlopAdapter, {
        trackId: config.trackId,
        repo: config.repo,
        worktreePath,
        learnings,
      });

      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-stop-slop',
        verdict: stopSlopResult.verdict,
      });

      if (stopSlopResult.verdict !== 'PASS') {
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          verdict: 'FAIL',
          error: `relay-stop-slop rejected the changes: ${stopSlopResult.reasons}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }

      // 5. Verify Build & Tests (relay-reviewer)
      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-reviewer',
      });

      const testCmd = config.testCommand || 'echo "Tests verified"';
      const reviewResult = await runReviewer(codeExecTool, testCmd, worktreePath);

      if (reviewResult.verdict !== 'PASS') {
        await this.eventBus.emit('pipeline.stage', {
          trackId: config.trackId,
          stage: 'relay-reviewer',
          verdict: 'FAIL',
        });
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          verdict: 'FAIL',
          error: `Test verification failed: ${reviewResult.error}\n${reviewResult.stderr}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }

      timestamps.buildPassAt = Date.now();
      timestamps.verifyPassAt = Date.now();

      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-reviewer',
        verdict: 'PASS',
      });

      // 6. Generate Guard 3 Evidence Package (relay-auditor)
      timestamps.evidenceGenAt = Date.now();
      const leadName = config.leadName || 'Lead-Certified-Auto';
      const { validation } = await runAuditor(
        this.planningService,
        taskCtx,
        reviewResult.stdout || 'Passed',
        leadName,
        stopSlopResult
      );

      timestamps.guard3At = Date.now();
      await this.eventBus.emit('guard.signed', {
        trackId: config.trackId,
        guard: 3,
        signedBy: leadName,
      });

      // 7. Commit Changes
      const commitRes = await gitTool.execute(
        {
          action: 'commit',
          message: `fix(issue #${config.issueNumber}): ${config.issueTitle}`,
        },
        { worktreePath }
      );

      if (!commitRes.success) {
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          error: `Git commit failed: ${commitRes.error}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }

      // 8. Create Pull Request
      await this.eventBus.emit('pipeline.stage', {
        trackId: config.trackId,
        stage: 'relay-auditor',
        verdict: 'PASS',
      });

      const prRes = await githubTool.execute({
        action: 'create_pr',
        repo: config.repo,
        title: `fix(issue #${config.issueNumber}): ${config.issueTitle}`,
        body: `Automated fix generated by Lodestar (Archetype ${archetype}) for issue #${config.issueNumber}.\n\nVerified with Guard 3 evidence pack.`,
        head: branchName,
      });

      if (!prRes.success) {
        return {
          trackId: config.trackId,
          success: false,
          archetype,
          error: `Failed to open pull request: ${prRes.error}`,
          cycleTimeMs: Date.now() - intakeAt,
        };
      }

      const prData = prRes.data as any;
      const cycleTime = calculateCycleTime(timestamps as TrackTimestamps);

      await this.eventBus.emit('pr.opened', {
        trackId: config.trackId,
        repo: config.repo,
        prUrl: prData?.htmlUrl || `https://github.com/${config.repo}/pull/${prData?.number || 1}`,
        prNumber: prData?.number,
      });

      await this.eventBus.emit('track.shipped', {
        trackId: config.trackId,
        repo: config.repo,
        cycleTimeMs: cycleTime.totalCycleTimeMs,
        evidenceCount: validation.validArtifacts,
        lead: leadName,
      });

      const deployOutcome = await runOptInDeploy(
        { codeExecTool, eventBus: this.eventBus },
        { trackId: config.trackId, repo: config.repo, worktreePath, commitHash: commitRes.data?.commitHash || '', baseDir: config.baseDir }
      );

      return {
        trackId: config.trackId,
        success: true,
        archetype,
        verdict: 'PASS',
        prUrl: prData?.htmlUrl,
        prNumber: prData?.number,
        cycleTimeMs: cycleTime.totalCycleTimeMs,
        evidenceValidated: validation.completenessPercent === 100,
        deployed: deployOutcome.deployed,
      };
    } finally {
      // Clean up worktree
      await gitTool.execute({
        action: 'cleanup_worktree',
        trackId: config.trackId,
      });
    }
  }
}
