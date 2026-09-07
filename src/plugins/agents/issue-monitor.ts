import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Tool } from '../../core/interfaces/tool-interface.ts';
import type { TrackEngine } from '../../core/engine.ts';

export interface IssueMonitorDeps {
  githubTool: Tool<any, any>;
  engine: Pick<TrackEngine, 'executeTrack'>;
  repo: string;
  labels: string[];
  provider: string;
  stopSlopProvider?: string;
  signedGuard1: boolean;
  baseDir?: string;
}

export interface IssueMonitorResult {
  dispatched: number;
  skipped: number;
  failed: number;
}

export function trackIdForIssue(repo: string, issueNumber: number): string {
  return `track_${repo.replace(/\W+/g, '-')}_${issueNumber}`;
}

export async function pollIssueMonitor(deps: IssueMonitorDeps): Promise<IssueMonitorResult> {
  const result: IssueMonitorResult = { dispatched: 0, skipped: 0, failed: 0 };

  const issuesRes = await deps.githubTool.execute({ action: 'list_issues', repo: deps.repo, labels: deps.labels });
  if (!issuesRes.success || !issuesRes.data) return result;

  for (const issue of issuesRes.data as { number: number; title: string; body: string; labels: string[] }[]) {
    const trackId = trackIdForIssue(deps.repo, issue.number);
    const trackDir = path.join(deps.baseDir || process.cwd(), 'flight-deck', 'tracks', trackId);
    const alreadyDone = await fs
      .access(path.join(trackDir, 'guard-evidence.md'))
      .then(() => true)
      .catch(() => false);

    if (alreadyDone) {
      result.skipped++;
      continue;
    }

    const trackResult = await deps.engine.executeTrack({
      trackId,
      repo: deps.repo,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
      labels: issue.labels,
      jobType: 'issue-monitor',
      provider: deps.provider,
      stopSlopProvider: deps.stopSlopProvider,
      signedGuard1: deps.signedGuard1,
      baseDir: deps.baseDir,
    });

    if (trackResult.success) {
      result.dispatched++;
    } else {
      result.failed++;
    }
  }

  return result;
}

export interface WorkerLoopOptions {
  intervalMs?: number;
  maxIterations?: number;
  onHeartbeat?: () => void;
}

export async function runIssueMonitorLoop(deps: IssueMonitorDeps, opts: WorkerLoopOptions = {}): Promise<void> {
  const intervalMs = opts.intervalMs ?? 60_000;
  const maxIterations = opts.maxIterations ?? Infinity;

  for (let i = 0; i < maxIterations; i++) {
    await pollIssueMonitor(deps);
    opts.onHeartbeat?.();
    if (i < maxIterations - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
}
