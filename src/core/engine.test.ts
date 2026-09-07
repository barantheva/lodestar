import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TrackEngine } from './engine.ts';
import { EventBus } from './event-bus.ts';
import { ServiceRegistry } from './registry.ts';
import type { AgentAdapter } from './interfaces/agent-interface.ts';
import type { Tool } from './interfaces/tool-interface.ts';
import { LoadstoneNexusBackend } from '../services/memory-service/loadstonenexus-backend.ts';

describe('TrackEngine', () => {
  const testBaseDir = path.join(process.cwd(), '.test-engine-deck-' + Date.now());
  const testDataDir = path.join(process.cwd(), '.test-engine-data-' + Date.now());
  let memoryBackend: LoadstoneNexusBackend;

  beforeEach(async () => {
    await fs.mkdir(testBaseDir, { recursive: true });
    await fs.mkdir(testDataDir, { recursive: true });
    memoryBackend = new LoadstoneNexusBackend({
      mode: 'local',
      dataDir: testDataDir,
    });
  });

  afterEach(async () => {
    memoryBackend.close();
    await fs.rm(testBaseDir, { recursive: true, force: true });
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('executes end-to-end track with Guard 1/2/3 relay and PR creation', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    const emittedEvents: string[] = [];
    eventBus.onAny((type) => {
      emittedEvents.push(type);
    });

    // Mock Git Tool
    const mockGit: Tool = {
      name: 'git',
      description: 'Mock Git',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') {
          return { success: true, data: { worktreePath: testBaseDir } };
        }
        if (args.action === 'commit') {
          return { success: true, data: { commitHash: 'abc1234' } };
        }
        if (args.action === 'cleanup_worktree') {
          return { success: true, data: { status: 'cleaned' } };
        }
        return { success: true };
      },
    };

    // Mock Code Exec Tool
    const mockCodeExec: Tool = {
      name: 'code-exec',
      description: 'Mock Exec',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true, data: { exitCode: 0, stdout: 'Tests passed' } };
      },
    };

    // Mock Github Tool
    const mockGithub: Tool = {
      name: 'github',
      description: 'Mock Github',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') {
          return {
            success: true,
            data: { number: 42, htmlUrl: 'https://github.com/org/repo/pull/42' },
          };
        }
        return { success: true };
      },
    };

    // Mock Agent Adapter
    const mockAgent: AgentAdapter = {
      name: 'claude-runner',
      provider: 'claude',
      async *dispatch() {
        yield { type: 'token', content: 'Writing code...\nVERDICT: PASS' };
        yield { type: 'done' };
      },
      async cancel() {},
    };

    registry.registerTool(mockGit);
    registry.registerTool(mockCodeExec);
    registry.registerTool(mockGithub);
    registry.registerAgent(mockAgent);

    const engine = new TrackEngine(eventBus, registry, memoryBackend);

    const result = await engine.executeTrack({
      trackId: 'track-test-1',
      repo: 'org/repo',
      issueNumber: 10,
      issueTitle: 'Add caching layer',
      issueBody: 'Implement LRU cache for memory lookups',
      archetype: 'B',
      signedGuard1: true,
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(true);
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(result.cycleTimeMs).toBeGreaterThanOrEqual(0);

    expect(emittedEvents).toContain('track.opened');
    expect(emittedEvents).toContain('guard.signed');
    expect(emittedEvents).toContain('pipeline.stage');
    expect(emittedEvents).toContain('pr.opened');
    expect(emittedEvents).toContain('track.shipped');
  });

  it('fails if Guard 1 signature is required for Archetype A and not signed', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({ name: 'git', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'github', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerAgent({ name: 'claude', provider: 'claude', async *dispatch() {}, async cancel() {} });

    const engine = new TrackEngine(eventBus, registry, memoryBackend);

    const result = await engine.executeTrack({
      trackId: 'track-arch-a',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Redesign DB',
      issueBody: 'Breaking change',
      archetype: 'A',
      signedGuard1: false,
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Guard 1 certification required');
  });

  it('auto-bypasses Guard 1 for Archetype C and H', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true, data: { commitHash: 'c1' } };
      },
    });
    registry.registerTool({
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() { return { success: true, data: { exitCode: 0, stdout: 'All passed' } }; },
    });
    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') return { success: true, data: { number: 9, htmlUrl: 'http://pr' } };
        return { success: true };
      },
    });
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() { yield { type: 'token', content: 'VERDICT: PASS' }; yield { type: 'done' }; },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry, memoryBackend);

    const result = await engine.executeTrack({
      trackId: 'track-hotfix',
      repo: 'org/repo',
      issueNumber: 999,
      issueTitle: 'Emergency hotfix',
      issueBody: 'P0 outage',
      archetype: 'H',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(true);
    expect(result.archetype).toBe('H');
  });

  it('fails cleanly when tools or adapter are missing', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();
    const engine = new TrackEngine(eventBus, registry);

    const result = await engine.executeTrack({
      trackId: 'track-missing',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Test',
      issueBody: 'Test',
      archetype: 'C',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required tools');

    // Register tools but miss adapter
    registry.registerTool({ name: 'git', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'github', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });

    const result2 = await engine.executeTrack({
      trackId: 'track-missing-adapter',
      repo: 'org/repo',
      issueNumber: 2,
      issueTitle: 'Test 2',
      issueBody: 'Test 2',
      archetype: 'C',
    });

    expect(result2.success).toBe(false);
    expect(result2.error).toContain('No agent adapter registered');
  });

  it('handles worktree creation failure', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: false, error: 'disk full' };
        return { success: true };
      },
    });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'github', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerAgent({ name: 'claude', provider: 'claude', async *dispatch() {}, async cancel() {} });

    const engine = new TrackEngine(eventBus, registry);
    const res = await engine.executeTrack({
      trackId: 'track-wt-fail',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'T',
      issueBody: 'B',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Failed to create worktree');
  });

  it('handles agent rate limits and errors cleanly', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true };
      },
    });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });
    registry.registerTool({ name: 'github', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });

    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() {
        yield { type: 'rate_limit', resumeAt: Date.now() + 1000 };
      },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);
    const rateLimitRes = await engine.executeTrack({
      trackId: 'track-rl',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'RL',
      issueBody: 'RL',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(rateLimitRes.success).toBe(false);
    expect(rateLimitRes.error).toContain('Rate limit encountered');

    // Test error event
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() {
        yield { type: 'error', error: 'Syntax generation crashed' };
      },
      async cancel() {},
    });

    const errorRes = await engine.executeTrack({
      trackId: 'track-err',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Err',
      issueBody: 'Err',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(errorRes.success).toBe(false);
    expect(errorRes.error).toContain('Agent error: Syntax generation crashed');
  });

  it('handles git commit or pr creation failures', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    let failCommit = true;
    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        if (args.action === 'commit' && failCommit) return { success: false, error: 'nothing to commit' };
        if (args.action === 'commit') return { success: true, data: { commitHash: 'c123' } };
        return { success: true };
      },
    });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true, data: { stdout: 'OK' } }; } });
    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') return { success: false, error: 'PR limit exceeded' };
        return { success: true };
      },
    });
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() { yield { type: 'token', content: 'VERDICT: PASS' }; yield { type: 'done' }; },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);

    const commitFailRes = await engine.executeTrack({
      trackId: 'track-commit-fail',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'CF',
      issueBody: 'CF',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(commitFailRes.success).toBe(false);
    expect(commitFailRes.error).toContain('Git commit failed');

    failCommit = false;
    const prFailRes = await engine.executeTrack({
      trackId: 'track-pr-fail',
      repo: 'org/repo',
      issueNumber: 2,
      issueTitle: 'PRF',
      issueBody: 'PRF',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(prFailRes.success).toBe(false);
    expect(prFailRes.error).toContain('Failed to open pull request');
  });

  it('handles failing test verification step gracefully', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true };
      },
    });

    registry.registerTool({
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: false, error: '1 test failed', data: { stderr: 'AssertionError' } };
      },
    });

    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true };
      },
    });

    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() {
        yield { type: 'token', content: 'VERDICT: PASS' };
        yield { type: 'done' };
      },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);
    const result = await engine.executeTrack({
      trackId: 'track-fail',
      repo: 'org/repo',
      issueNumber: 5,
      issueTitle: 'Fix bug',
      issueBody: 'Description',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAIL');
    expect(result.error).toContain('Test verification failed');
  });

  it('blocks progression when relay-stop-slop returns FAIL, without running the reviewer stage', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();
    let codeExecCalled = false;

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true };
      },
    });
    registry.registerTool({
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        codeExecCalled = true;
        return { success: true, data: { stdout: 'OK' } };
      },
    });
    registry.registerTool({ name: 'github', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true }; } });

    let callCount = 0;
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() {
        callCount++;
        if (callCount === 1) {
          yield { type: 'done' };
        } else {
          yield { type: 'token', content: 'Found dead code.\nVERDICT: FAIL' };
        }
      },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);
    const result = await engine.executeTrack({
      trackId: 'track-slop-fail',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Slop',
      issueBody: 'Slop',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(false);
    expect(result.verdict).toBe('FAIL');
    expect(result.error).toContain('relay-stop-slop');
    expect(codeExecCalled).toBe(false);
  });

  it('resolves a distinct stopSlopProvider adapter for the relay-stop-slop stage', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true, data: { commitHash: 'c1' } };
      },
    });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true, data: { stdout: 'OK' } }; } });
    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') return { success: true, data: { number: 1, htmlUrl: 'http://pr' } };
        return { success: true };
      },
    });

    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() { yield { type: 'done' }; },
      async cancel() {},
    });
    registry.registerAgent({
      name: 'gemini',
      provider: 'gemini',
      async *dispatch() { yield { type: 'token', content: 'VERDICT: PASS' }; },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);
    const result = await engine.executeTrack({
      trackId: 'track-distinct-provider',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'T',
      issueBody: 'T',
      archetype: 'C',
      provider: 'claude',
      stopSlopProvider: 'gemini',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(true);
  });

  it('resumes a track whose plan.md already exists instead of regenerating Guard 1/2 docs', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true, data: { commitHash: 'c1' } };
      },
    });
    registry.registerTool({ name: 'code-exec', description: '', parameters: { type: 'object', properties: {} }, async execute() { return { success: true, data: { stdout: 'OK' } }; } });
    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') return { success: true, data: { number: 1, htmlUrl: 'http://pr' } };
        return { success: true };
      },
    });
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() { yield { type: 'token', content: 'VERDICT: PASS' }; yield { type: 'done' }; },
      async cancel() {},
    });

    const engine = new TrackEngine(eventBus, registry);

    const trackId = 'track-resume-1';
    const trackDir = path.join(testBaseDir, 'flight-deck', 'tracks', trackId);
    await fs.mkdir(trackDir, { recursive: true });
    await fs.writeFile(path.join(trackDir, 'intent.md'), 'ORIGINAL INTENT CONTENT', 'utf-8');
    await fs.writeFile(path.join(trackDir, 'plan.md'), 'ORIGINAL PLAN CONTENT', 'utf-8');

    const result = await engine.executeTrack({
      trackId,
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'Resume test',
      issueBody: 'Resume test',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(true);
    const intentContent = await fs.readFile(path.join(trackDir, 'intent.md'), 'utf-8');
    expect(intentContent).toBe('ORIGINAL INTENT CONTENT');
  });

  it('opt-in deploys after shipping when flight-deck/workflow.md declares a Deploy: command', async () => {
    const eventBus = new EventBus();
    const registry = new ServiceRegistry();

    await fs.mkdir(path.join(testBaseDir, 'flight-deck'), { recursive: true });
    await fs.writeFile(path.join(testBaseDir, 'flight-deck', 'workflow.md'), 'Deploy: echo deploying\n', 'utf-8');

    registry.registerTool({
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_worktree') return { success: true, data: { worktreePath: testBaseDir } };
        return { success: true, data: { commitHash: 'c1' } };
      },
    });
    registry.registerTool({
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        return { success: true, data: { stdout: args.command === 'echo deploying' ? 'deploying' : 'OK' } };
      },
    });
    registry.registerTool({
      name: 'github',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args: any) {
        if (args.action === 'create_pr') return { success: true, data: { number: 1, htmlUrl: 'http://pr' } };
        return { success: true };
      },
    });
    registry.registerAgent({
      name: 'claude',
      provider: 'claude',
      async *dispatch() { yield { type: 'token', content: 'VERDICT: PASS' }; yield { type: 'done' }; },
      async cancel() {},
    });

    const deployedEvents: any[] = [];
    eventBus.on('track.deployed', p => { deployedEvents.push(p); });

    const engine = new TrackEngine(eventBus, registry);
    const result = await engine.executeTrack({
      trackId: 'track-deploy-1',
      repo: 'org/repo',
      issueNumber: 1,
      issueTitle: 'T',
      issueBody: 'T',
      archetype: 'C',
      baseDir: testBaseDir,
    });

    expect(result.success).toBe(true);
    expect(result.deployed).toBe(true);
    expect(deployedEvents).toHaveLength(1);
  });
});
