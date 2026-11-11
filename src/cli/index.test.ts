import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { main, printHelp, registerDefaultPlugins } from './index.ts';
import { globalRegistry } from '../core/registry.ts';
import type { Tool } from '../core/interfaces/tool-interface.ts';
import type { AgentAdapter } from '../core/interfaces/agent-interface.ts';

describe('CLI Controller', () => {
  it('prints help when --help flag or no command is passed', async () => {
    let output = '';
    const origLog = console.log;
    console.log = (msg: string) => {
      output += msg + '\n';
    };

    try {
      const code1 = await main(['--help']);
      expect(code1).toBe(0);
      expect(output).toContain('Lodestar CLI');

      output = '';
      const code2 = await main([]);
      expect(code2).toBe(0);
      expect(output).toContain('USAGE');
    } finally {
      console.log = origLog;
    }
  });

  it('prints version when --version flag is passed', async () => {
    let output = '';
    const origLog = console.log;
    console.log = (msg: string) => {
      output += msg;
    };

    try {
      const code = await main(['--version']);
      expect(code).toBe(0);
      expect(output).toContain('Lodestar v0.1.0');
    } finally {
      console.log = origLog;
    }
  });

  it('handles unknown commands with error code 1', async () => {
    let errOutput = '';
    const origErr = console.error;
    console.error = (msg: string) => {
      errOutput += msg;
    };

    try {
      const code = await main(['invalid-cmd']);
      expect(code).toBe(1);
      expect(errOutput).toContain('Unknown command');
    } finally {
      console.error = origErr;
    }
  });

  it('executes sentinel-test command successfully', async () => {
    const code = await main(['sentinel-test']);
    expect(code).toBe(0);
  });

  it('validates run command requires --repo and --issue', async () => {
    let errOutput = '';
    const origErr = console.error;
    console.error = (msg: string) => {
      errOutput += msg;
    };

    try {
      const code = await main(['run']);
      expect(code).toBe(1);
      expect(errOutput).toContain('requires --repo <owner/repo> and --issue <number>');

      errOutput = '';
      const code2 = await main(['run', '--repo', 'org/repo', '--issue', 'invalid']);
      expect(code2).toBe(1);
      expect(errOutput).toContain('Invalid issue number');
    } finally {
      console.error = origErr;
    }
  });

  it('executes status command cleanly with environment variables', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    const origCoder = process.env.PRIMARY_AUTO_CODER;
    try {
      process.env.GITHUB_TOKEN = 'ghp_status_test';
      process.env.PRIMARY_AUTO_CODER = 'claude';
      process.env.DATA_DIR = './data';

      const code = await main(['status']);
      expect(code).toBe(0);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      else delete process.env.GITHUB_TOKEN;
      if (origCoder) process.env.PRIMARY_AUTO_CODER = origCoder;
      else delete process.env.PRIMARY_AUTO_CODER;
    }
  });

  it('handles status command failure when required env is missing', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    let errOutput = '';
    const origErr = console.error;
    console.error = (msg: string) => {
      errOutput += msg;
    };

    try {
      const code = await main(['status']);
      expect(code).toBe(1);
      expect(errOutput).toContain('Status check failed');
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      console.error = origErr;
    }
  });

  it('executes run command successfully end-to-end', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    try {
      process.env.GITHUB_TOKEN = 'ghp_run_test';

      const mockGit: Tool = {
        name: 'git',
        description: 'Mock Git',
        parameters: { type: 'object', properties: {} },
        async execute(args: any) {
          if (args.action === 'create_worktree') return { success: true, data: { worktreePath: '/tmp/cli_wt' } };
          if (args.action === 'commit') return { success: true, data: { commitHash: 'cli123' } };
          if (args.action === 'cleanup_worktree') return { success: true, data: { status: 'cleaned' } };
          return { success: true };
        },
      };

      const mockGithub: Tool = {
        name: 'github',
        description: 'Mock Github',
        parameters: { type: 'object', properties: {} },
        async execute(args: any) {
          if (args.action === 'get_issue') {
            return { success: true, data: { title: 'CLI Test Issue', body: 'Body' } };
          }
          if (args.action === 'create_pr') {
            return { success: true, data: { number: 99, htmlUrl: 'https://github.com/org/repo/pull/99' } };
          }
          return { success: true };
        },
      };

      const mockCodeExec: Tool = {
        name: 'code-exec',
        description: 'Mock Code Exec',
        parameters: { type: 'object', properties: {} },
        async execute() {
          return { success: true, data: { exitCode: 0, stdout: 'ok' } };
        },
      };

      const mockAgent: AgentAdapter = {
        name: 'claude-runner',
        provider: 'claude',
        async *dispatch() {
          yield { type: 'token', content: 'generating fix...\nVERDICT: PASS' };
          yield { type: 'done' };
        },
        async cancel() {},
      };

      globalRegistry.registerTool(mockGit);
      globalRegistry.registerTool(mockGithub);
      globalRegistry.registerTool(mockCodeExec);
      globalRegistry.registerAgent(mockAgent);

      const code = await main(['run', '--repo', 'org/repo', '--issue', '42']);
      expect(code).toBe(0);
    } finally {
      if (origToken !== undefined) {
        process.env.GITHUB_TOKEN = origToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    }
  });

  it('registers default tools and agent plugins', () => {
    process.env.OPENAI_API_KEY = 'sk-test-cli';
    registerDefaultPlugins();
    expect(globalRegistry.getTool('git')).toBeDefined();
    expect(globalRegistry.getTool('github')).toBeDefined();
    expect(globalRegistry.getTool('code-exec')).toBeDefined();
    expect(globalRegistry.getAgent('claude')).toBeDefined();
    expect(globalRegistry.getAgent('openai')).toBeDefined();
    delete process.env.OPENAI_API_KEY;
  });

  it('executes init-knowledge command and reuses cache on second run', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    const testDataDir = path.join(process.cwd(), '.test-cli-data-' + Date.now());
    try {
      process.env.GITHUB_TOKEN = 'ghp_init_test';
      process.env.DATA_DIR = testDataDir;
      process.env.PRIMARY_AUTO_CODER = 'claude';
      process.env.KNOWLEDGE_BACKEND = 'loadstonenexus';
      process.env.LOADSTONENEXUS_MCP_MODE = 'local';

      // First run: builds cache
      const code1 = await main(['init-knowledge', '--repo', 'test/repo']);
      expect(code1).toBe(0);

      // Second run: reuses cache
      const code2 = await main(['init-knowledge', '--repo', 'test/repo']);
      expect(code2).toBe(0);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      else delete process.env.GITHUB_TOKEN;
      await fs.rm(testDataDir, { recursive: true, force: true });
    }
  });

  it('handles argument parsing errors cleanly', async () => {
    let errOutput = '';
    const origErr = console.error;
    console.error = (msg: string) => { errOutput += msg; };
    try {
      const code = await main(['--invalid-flag-that-does-not-exist']);
      expect(code).toBe(1);
      expect(errOutput).toContain('Error parsing arguments');
    } finally {
      console.error = origErr;
    }
  });

  it('handles track execution failure in run command', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    try {
      process.env.GITHUB_TOKEN = 'ghp_run_test';

      globalRegistry.registerTool({
        name: 'git',
        description: '',
        parameters: { type: 'object', properties: {} },
        async execute(args: any) {
          if (args.action === 'create_worktree') return { success: false, error: 'Cannot create branch' };
          return { success: true };
        },
      });
      globalRegistry.registerTool({
        name: 'github',
        description: '',
        parameters: { type: 'object', properties: {} },
        async execute() { return { success: true }; },
      });
      globalRegistry.registerTool({
        name: 'code-exec',
        description: '',
        parameters: { type: 'object', properties: {} },
        async execute() { return { success: true }; },
      });
      globalRegistry.registerAgent({
        name: 'claude',
        provider: 'claude',
        async *dispatch() { yield { type: 'done' }; },
        async cancel() {},
      });

      const code = await main(['run', '--repo', 'org/repo', '--issue', '99']);
      expect(code).toBe(1);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      else delete process.env.GITHUB_TOKEN;
    }
  });

  it('handles run command exception gracefully', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    try {
      process.env.GITHUB_TOKEN = 'ghp_run_test';

      globalRegistry.registerTool({
        name: 'github',
        description: '',
        parameters: { type: 'object', properties: {} },
        async execute() { throw new Error('GitHub API exploded'); },
      });

      const code = await main(['run', '--repo', 'org/repo', '--issue', '100']);
      expect(code).toBe(1);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      else delete process.env.GITHUB_TOKEN;
    }
  });

  it('executes init-knowledge with obsidian backend', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    const testVault = path.join(process.cwd(), '.test-cli-vault-' + Date.now());
    try {
      process.env.GITHUB_TOKEN = 'ghp_init_test';
      process.env.PRIMARY_AUTO_CODER = 'claude';
      process.env.KNOWLEDGE_BACKEND = 'obsidian';
      process.env.OBSIDIAN_VAULT_PATH = testVault;

      const code = await main(['init-knowledge', '--repo', 'obsidian/repo']);
      expect(code).toBe(0);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      else delete process.env.GITHUB_TOKEN;
      await fs.rm(testVault, { recursive: true, force: true });
    }
  });

  it('handles init-knowledge error when config is missing required keys', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const code = await main(['init-knowledge', '--repo', 'err/repo']);
      expect(code).toBe(1);
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
    }
  });

  it('validates worker command requires --job and --repo', async () => {
    const code1 = await main(['worker', '--job', 'issue-monitor']);
    expect(code1).toBe(1);

    const code2 = await main(['worker', '--repo', 'owner/repo']);
    expect(code2).toBe(1);
  });

  it('validates daemon command requires GITHUB_REPO to be configured', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    const origRepo = process.env.GITHUB_REPO;
    process.env.GITHUB_TOKEN = 'ghp_daemon_test';
    delete process.env.GITHUB_REPO;
    try {
      const code = await main(['daemon']);
      expect(code).toBe(1);
    } finally {
      if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
      if (origRepo !== undefined) process.env.GITHUB_REPO = origRepo;
    }
  });

  it('validates daemon command requires at least one AGENT_N_PROVIDER/AGENT_N_JOB pair', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    const origRepo = process.env.GITHUB_REPO;
    const origAgentCount = process.env.AGENT_COUNT;
    process.env.GITHUB_TOKEN = 'ghp_daemon_test';
    process.env.GITHUB_REPO = 'owner/repo';
    process.env.AGENT_COUNT = '0';
    try {
      const code = await main(['daemon']);
      expect(code).toBe(1);
    } finally {
      if (origToken !== undefined) process.env.GITHUB_TOKEN = origToken;
      if (origRepo !== undefined) process.env.GITHUB_REPO = origRepo;
      else delete process.env.GITHUB_REPO;
      if (origAgentCount !== undefined) process.env.AGENT_COUNT = origAgentCount;
      else delete process.env.AGENT_COUNT;
    }
  });

  it('includes behavior-monitor in help text', async () => {
    let output = '';
    const origLog = console.log;
    console.log = (msg: string) => {
      output += msg + '\n';
    };
    try {
      const code = await main(['--help']);
      expect(code).toBe(0);
      expect(output).toContain('behavior-monitor');
    } finally {
      console.log = origLog;
    }
  });
});

