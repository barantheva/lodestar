import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pollIssueMonitor, runIssueMonitorLoop } from './issue-monitor.ts';
import type { Tool } from '../../core/interfaces/tool-interface.ts';

function fakeGithubTool(issues: any[]): Tool<any, any> {
  return {
    name: 'github',
    description: 'fake',
    parameters: { type: 'object', properties: {} },
    async execute(args) {
      if (args.action === 'list_issues') return { success: true, data: issues };
      return { success: true };
    },
  };
}

describe('pollIssueMonitor', () => {
  const testBaseDir = path.join(process.cwd(), '.test-issue-monitor-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('dispatches an engine track for each open issue', async () => {
    const githubTool = fakeGithubTool([
      { number: 1, title: 'Fix bug', body: 'b', labels: ['bug'] },
      { number: 2, title: 'Add feature', body: 'f', labels: ['enhancement'] },
    ]);
    const dispatchedIssues: number[] = [];
    const engine = {
      async executeTrack(cfg: any) {
        dispatchedIssues.push(cfg.issueNumber);
        return { success: true, trackId: cfg.trackId, archetype: 'B', cycleTimeMs: 1 };
      },
    };

    const result = await pollIssueMonitor({
      githubTool,
      engine: engine as any,
      repo: 'owner/repo',
      labels: ['bug', 'enhancement'],
      provider: 'claude',
      signedGuard1: true,
      baseDir: testBaseDir,
    });

    expect(result.dispatched).toBe(2);
    expect(dispatchedIssues.sort()).toEqual([1, 2]);
  });

  it('uses a deterministic trackId keyed by repo and issue number', async () => {
    const githubTool = fakeGithubTool([{ number: 7, title: 'T', body: 'B', labels: [] }]);
    let capturedTrackId = '';
    const engine = {
      async executeTrack(cfg: any) {
        capturedTrackId = cfg.trackId;
        return { success: true, trackId: cfg.trackId, archetype: 'B', cycleTimeMs: 1 };
      },
    };

    await pollIssueMonitor({
      githubTool,
      engine: engine as any,
      repo: 'owner/repo',
      labels: [],
      provider: 'claude',
      signedGuard1: true,
      baseDir: testBaseDir,
    });

    expect(capturedTrackId).toBe('track_owner-repo_7');
  });

  it('skips an issue whose track already has a completed evidence package', async () => {
    const githubTool = fakeGithubTool([{ number: 9, title: 'Done already', body: 'b', labels: [] }]);
    const trackDir = path.join(testBaseDir, 'flight-deck', 'tracks', 'track_owner-repo_9');
    await fs.mkdir(trackDir, { recursive: true });
    await fs.writeFile(path.join(trackDir, 'guard-evidence.md'), 'CERTIFIED', 'utf-8');

    let called = false;
    const engine = {
      async executeTrack() {
        called = true;
        return { success: true, trackId: 't', archetype: 'B', cycleTimeMs: 1 };
      },
    };

    const result = await pollIssueMonitor({
      githubTool,
      engine: engine as any,
      repo: 'owner/repo',
      labels: [],
      provider: 'claude',
      signedGuard1: true,
      baseDir: testBaseDir,
    });

    expect(called).toBe(false);
    expect(result.skipped).toBe(1);
    expect(result.dispatched).toBe(0);
  });

  it('counts a failed track dispatch without throwing', async () => {
    const githubTool = fakeGithubTool([{ number: 3, title: 'T', body: 'B', labels: [] }]);
    const engine = {
      async executeTrack() {
        return { success: false, trackId: 't', archetype: 'B', cycleTimeMs: 1, error: 'boom' };
      },
    };

    const result = await pollIssueMonitor({
      githubTool,
      engine: engine as any,
      repo: 'owner/repo',
      labels: [],
      provider: 'claude',
      signedGuard1: true,
      baseDir: testBaseDir,
    });

    expect(result.failed).toBe(1);
    expect(result.dispatched).toBe(0);
  });

  it('polls repeatedly and fires a heartbeat callback per iteration, stopping at maxIterations', async () => {
    const githubTool = fakeGithubTool([]);
    let pollCount = 0;
    const engine = {
      async executeTrack() {
        pollCount++;
        return { success: true, trackId: 't', archetype: 'B', cycleTimeMs: 1 };
      },
    };
    let heartbeats = 0;

    await runIssueMonitorLoop(
      { githubTool, engine: engine as any, repo: 'owner/repo', labels: [], provider: 'claude', signedGuard1: true, baseDir: testBaseDir },
      { intervalMs: 0, maxIterations: 3, onHeartbeat: () => { heartbeats++; } }
    );

    expect(heartbeats).toBe(3);
  });
});
