import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runOptInDeploy, performRollback } from './deploy-runner.ts';
import { EventBus } from '../../core/event-bus.ts';
import type { Tool } from '../../core/interfaces/tool-interface.ts';

describe('runOptInDeploy', () => {
  const testBaseDir = path.join(process.cwd(), '.test-deploy-runner-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('skips deploy when no workflow.md declares a Deploy: command (opt-out by default)', async () => {
    const eventBus = new EventBus();
    let execCalled = false;
    const codeExecTool: Tool<any, any> = {
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        execCalled = true;
        return { success: true, data: {} };
      },
    };

    const result = await runOptInDeploy(
      { codeExecTool, eventBus },
      { trackId: 't1', repo: 'owner/repo', worktreePath: '/tmp/wt', commitHash: 'abc123', baseDir: testBaseDir }
    );

    expect(result.deployed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(execCalled).toBe(false);
  });

  it('runs the declared Deploy: command and emits track.deployed on success', async () => {
    await fs.mkdir(path.join(testBaseDir, 'flight-deck'), { recursive: true });
    await fs.writeFile(path.join(testBaseDir, 'flight-deck', 'workflow.md'), 'Deploy: echo deploying\n', 'utf-8');

    const eventBus = new EventBus();
    const emitted: any[] = [];
    eventBus.on('track.deployed', p => { emitted.push(p); });

    let capturedCommand = '';
    const codeExecTool: Tool<any, any> = {
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args) {
        capturedCommand = args.command;
        return { success: true, data: { stdout: 'deployed' } };
      },
    };

    const result = await runOptInDeploy(
      { codeExecTool, eventBus },
      { trackId: 't1', repo: 'owner/repo', worktreePath: '/tmp/wt', commitHash: 'abc123', baseDir: testBaseDir }
    );

    expect(result.deployed).toBe(true);
    expect(capturedCommand).toBe('echo deploying');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].trackId).toBe('t1');
  });

  it('returns a failure without throwing when the deploy command itself fails', async () => {
    await fs.mkdir(path.join(testBaseDir, 'flight-deck'), { recursive: true });
    await fs.writeFile(path.join(testBaseDir, 'flight-deck', 'workflow.md'), 'Deploy: exit 1\n', 'utf-8');

    const eventBus = new EventBus();
    const codeExecTool: Tool<any, any> = {
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: false, error: 'Command exited with non-zero code 1' };
      },
    };

    const result = await runOptInDeploy(
      { codeExecTool, eventBus },
      { trackId: 't1', repo: 'owner/repo', worktreePath: '/tmp/wt', commitHash: 'abc123', baseDir: testBaseDir }
    );

    expect(result.deployed).toBe(false);
    expect(result.error).toContain('non-zero code 1');
  });
});

describe('performRollback', () => {
  const testBaseDir = path.join(process.cwd(), '.test-deploy-runner-rollback-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('reverts the commit, emits deploy.rollback, and opens an archetype-H remediation track', async () => {
    const eventBus = new EventBus();
    const rollbackEvents: any[] = [];
    eventBus.on('deploy.rollback', p => { rollbackEvents.push(p); });

    const gitTool: Tool<any, any> = {
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute(args) {
        if (args.action === 'revert') return { success: true, data: { commitHash: 'reverted-sha', status: 'reverted' } };
        return { success: true };
      },
    };
    const codeExecTool: Tool<any, any> = {
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true };
      },
    };

    let capturedTrackConfig: any;
    const engine = {
      async executeTrack(cfg: any) {
        capturedTrackConfig = cfg;
        return { trackId: cfg.trackId, success: true, archetype: cfg.archetype, cycleTimeMs: 1 };
      },
    };

    const result = await performRollback(
      { gitTool, codeExecTool, eventBus, engine: engine as any },
      { trackId: 't1', repo: 'owner/repo', worktreePath: '/tmp/wt', commitHash: 'abc123', reason: 'Health check probe failed 3 consecutive attempts post-deploy.', baseDir: testBaseDir }
    );

    expect(result.reverted).toBe(true);
    expect(rollbackEvents).toHaveLength(1);
    expect(rollbackEvents[0].revertedCommit).toBe('reverted-sha');
    expect(rollbackEvents[0].reason).toContain('Health check');

    expect(capturedTrackConfig.archetype).toBe('H');
    expect(capturedTrackConfig.repo).toBe('owner/repo');
    expect(result.remediationTrackId).toBe(capturedTrackConfig.trackId);
  });

  it('does not open a remediation track when the revert itself fails', async () => {
    const eventBus = new EventBus();
    const gitTool: Tool<any, any> = {
      name: 'git',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: false, error: 'Revert failed: conflict' };
      },
    };
    const codeExecTool: Tool<any, any> = {
      name: 'code-exec',
      description: '',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return { success: true };
      },
    };
    let engineCalled = false;
    const engine = {
      async executeTrack() {
        engineCalled = true;
        return { trackId: 'x', success: true, archetype: 'H', cycleTimeMs: 1 };
      },
    };

    const result = await performRollback(
      { gitTool, codeExecTool, eventBus, engine: engine as any },
      { trackId: 't1', repo: 'owner/repo', worktreePath: '/tmp/wt', commitHash: 'abc123', reason: 'test', baseDir: testBaseDir }
    );

    expect(result.reverted).toBe(false);
    expect(engineCalled).toBe(false);
  });
});
