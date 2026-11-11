import { parseArgs } from 'node:util';
import { loadConfig } from '../config/index.ts';
import { globalEventBus } from '../core/event-bus.ts';
import { globalRegistry } from '../core/registry.ts';
import { TrackEngine } from '../core/engine.ts';
import { GitTool } from '../plugins/tools/git-tool.ts';
import { GithubTool } from '../plugins/tools/github-tool.ts';
import { CodeExecTool } from '../plugins/tools/code-exec-tool.ts';
import { AnthropicAdapter } from '../adapters/anthropic-adapter.ts';
import { GeminiAdapter } from '../adapters/gemini-adapter.ts';
import { KimiAdapter } from '../adapters/kimi-adapter.ts';
import { DeepseekAdapter } from '../adapters/deepseek-adapter.ts';
import { OpenAiAdapter } from '../adapters/openai-adapter.ts';
import { FleetDb } from '../services/agent-service/fleet-db.ts';
import { Supervisor } from '../services/agent-service/supervisor.ts';
import { runIssueMonitorLoop } from '../plugins/agents/issue-monitor.ts';
import { runBehaviorMonitorLoop } from '../plugins/agents/behavior-monitor.ts';
import { openAuthDb } from '../data-access/auth-db-client.ts';
import { AuthService } from '../services/auth-service/index.ts';
import { createDashboardServer } from '../dashboard/server.ts';
import type { KnowledgeBackend } from '../core/interfaces/memory-interface.ts';
import type { Config } from '../config/index.ts';
import { mkdirSync } from 'node:fs';
import * as nodePath from 'node:path';
import { evaluateRollbackCondition, type PostDeployTelemetry } from '../services/monitor-service/metrics-calculator.ts';
import { performRollback } from '../services/monitor-service/deploy-runner.ts';

export function printHelp(): void {
  console.log(`
Lodestar CLI — Autonomous Spec-Driven Software Factory

USAGE:
  lodestar <command> [options]
  bun run src/cli/index.ts <command> [options]

COMMANDS:
  run             Execute an automated track for a specific GitHub issue
  worker          Run one named worker's polling loop for a job type (spawned by daemon)
  daemon          Start the fleet supervisor across all configured repos/agents
  dashboard       Start the operations dashboard (reads the daemon's Fleet DB + knowledge backend)
  status         Display daemon status, registered components, and config
  init-knowledge  Index repository AST symbols and cache in knowledge backend
  sentinel-test   Simulate a rate-limit hold event and verify sentinel response
  deploy-test     Simulate a failed post-deploy health check and verify auto-revert + H-track remediation

OPTIONS:
  --repo <owner/name>     Target GitHub repository (e.g. apache/casbin-gateway)
  --issue <number>        GitHub issue number to fix
  --job <job-type>        Worker job type (issue-monitor | incident-monitor | codebase-monitor | instrumentation-campaign | behavior-monitor)
  --provider <model>      Model provider override (claude | gemini | kimi | deepseek | openai)
  --test-cmd <command>    Custom test/build verification command
  --port <number>         Dashboard port (overrides PORT, default 3000)
  --help, -h             Show this help message
  --version, -v           Show version information

EXAMPLES:
  lodestar run --issue 42 --repo owner/my-app
  lodestar worker --job issue-monitor --repo owner/my-app
  lodestar worker --job behavior-monitor --repo owner/my-app
  lodestar daemon
  lodestar dashboard --port 3000
  lodestar status
  lodestar sentinel-test
`);
}

export function registerDefaultPlugins(): void {
  if (!globalRegistry.getTool('git')) globalRegistry.registerTool(new GitTool());
  if (!globalRegistry.getTool('github')) globalRegistry.registerTool(new GithubTool());
  if (!globalRegistry.getTool('code-exec')) globalRegistry.registerTool(new CodeExecTool());
  if (!globalRegistry.getAgent('claude')) globalRegistry.registerAgent(new AnthropicAdapter());
  if (!globalRegistry.getAgent('gemini') && process.env.GEMINI_API_KEY) {
    globalRegistry.registerAgent(new GeminiAdapter(process.env.GEMINI_API_KEY));
  }
  if (!globalRegistry.getAgent('kimi') && process.env.KIMI_API_KEY) {
    globalRegistry.registerAgent(new KimiAdapter(process.env.KIMI_API_KEY));
  }
  if (!globalRegistry.getAgent('deepseek') && process.env.DEEPSEEK_API_KEY) {
    globalRegistry.registerAgent(new DeepseekAdapter(process.env.DEEPSEEK_API_KEY));
  }
  if (!globalRegistry.getAgent('openai') && process.env.OPENAI_API_KEY) {
    globalRegistry.registerAgent(new OpenAiAdapter(process.env.OPENAI_API_KEY));
  }
}

async function createKnowledgeBackend(config: Config): Promise<KnowledgeBackend> {
  if (config.knowledgeBackend === 'obsidian') {
    const { ObsidianBackend } = await import('../services/memory-service/obsidian-backend.ts');
    return new ObsidianBackend({
      vaultPath: config.obsidianVaultPath,
      apiUrl: config.obsidianVaultPath ? undefined : config.obsidianMcpUrl,
      apiKey: config.obsidianApiKey,
    });
  }
  const { LoadstoneNexusBackend } = await import('../services/memory-service/loadstonenexus-backend.ts');
  return new LoadstoneNexusBackend({
    mode: config.loadstoneNexusMcpMode as 'local' | 'remote',
    dataDir: config.dataDir,
    mcpUrl: config.loadstoneNexusMcpUrl,
  });
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = {
    help: { type: 'boolean' as const, short: 'h' },
    version: { type: 'boolean' as const, short: 'v' },
    repo: { type: 'string' as const },
    issue: { type: 'string' as const },
    job: { type: 'string' as const },
    provider: { type: 'string' as const },
    'test-cmd': { type: 'string' as const },
    'sign-guard-1': { type: 'boolean' as const },
    port: { type: 'string' as const },
  };

  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({
      args: argv,
      options,
      allowPositionals: true,
    });
  } catch (err: any) {
    console.error(`Error parsing arguments: ${err.message}`);
    printHelp();
    return 1;
  }

  if (parsed.values.version) {
    console.log('Lodestar v0.1.0');
    return 0;
  }

  const command = parsed.positionals[0];

  if (parsed.values.help || !command) {
    printHelp();
    return 0;
  }

  registerDefaultPlugins();

  switch (command) {
    case 'status': {
      try {
        const config = loadConfig();
        console.log(`[Lodestar Status]`);
        console.log(`- Primary Provider: ${config.primaryAutoCoder}`);
        console.log(`- Team Mode: ${config.teamMode}`);
        console.log(`- Knowledge Backend: ${config.knowledgeBackend}`);
        console.log(`- Monitored Repositories: ${config.githubRepos.join(', ') || 'None configured'}`);
        console.log(`- Registered Tools: ${globalRegistry.listTools().map(t => t.name).join(', ')}`);
        console.log(`- Registered Agents: ${globalRegistry.listAgents().map(a => a.name).join(', ')}`);
        return 0;
      } catch (err: any) {
        console.error(`Status check failed: ${err.message}`);
        return 1;
      }
    }

    case 'init-knowledge': {
      try {
        const config = loadConfig();
        const targetRepo = parsed.values.repo || (config.githubRepos.length > 0 ? config.githubRepos[0] : 'local/repo');
        const force = false;
        const backend = await createKnowledgeBackend(config);

        const { GraphMemory } = await import('../plugins/memory/graph-memory.ts');
        const graphMem = new GraphMemory(backend);

        const cached = await graphMem.getCachedGraph(targetRepo);
        if (cached && !force) {
          console.log(`[Knowledge] Reusing cached knowledge for ${targetRepo} (${cached.symbols.length} symbols, ${cached.fileTree.length} files).`);
          return 0;
        }

        console.log(`[Knowledge] Indexing knowledge for ${targetRepo}...`);
        const graph = await graphMem.buildRepoGraph(process.cwd(), targetRepo);
        console.log(`[Knowledge] Indexed ${graph.symbols.length} symbols across ${graph.fileTree.length} files in ${targetRepo}.`);
        return 0;
      } catch (err: any) {
        console.error(`Knowledge initialization failed: ${err.message}`);
        return 1;
      }
    }

    case 'sentinel-test': {
      console.log('[Sentinel Test] Emitting simulated rate_limit.hit event...');
      const resumeAt = Date.now() + 6 * 3600 * 1000;
      await globalEventBus.emit('rate_limit.hit', {
        workerName: 'claude-code',
        provider: 'claude',
        resumeAt,
      });
      console.log(`[Sentinel Test] Hold schedule emitted successfully (resume_at: ${new Date(resumeAt).toISOString()}).`);
      return 0;
    }

    case 'deploy-test': {
      const trackId = `deploy-test-${Date.now()}`;
      const repo = parsed.values.repo || 'local/repo';
      const gitTool = globalRegistry.getTool<any, any>('git') as GitTool;
      const codeExecTool = globalRegistry.getTool<any, any>('code-exec') as CodeExecTool;
      const engine = new TrackEngine(globalEventBus, globalRegistry);

      try {
        console.log('[Deploy Test] Creating an isolated worktree to simulate a shipped commit...');
        const wtRes = await gitTool.execute({ action: 'create_worktree', trackId });
        if (!wtRes.success || !wtRes.data?.worktreePath) {
          console.error(`[Deploy Test] Failed to create worktree: ${wtRes.error}`);
          return 1;
        }
        const worktreePath = wtRes.data.worktreePath;

        await codeExecTool.execute({
          command: 'echo "deploy-test" > DEPLOY_TEST.tmp && git add DEPLOY_TEST.tmp && git commit -m "deploy-test: simulated shipped commit"',
          cwd: worktreePath,
        });
        const revRes = await codeExecTool.execute({ command: 'git rev-parse HEAD', cwd: worktreePath });
        const commitHash = revRes.data?.stdout.trim() || '';

        const telemetry: PostDeployTelemetry = {
          trackId,
          repo,
          deployedAt: Date.now(),
          observationWindowEnd: Date.now() + 30 * 60_000,
          healthCheckFails: 3,
          sentryErrorSpikeCount: 0,
          baselineErrorRate: 0,
          currentErrorRate: 0,
        };
        const verdict = evaluateRollbackCondition(telemetry);
        console.log(`[Deploy Test] Simulated post-deploy health check: ${verdict.shouldRollback ? 'FAILED' : 'passed'} (${verdict.reason || 'nominal'})`);

        if (!verdict.shouldRollback) {
          await gitTool.execute({ action: 'cleanup_worktree', trackId });
          return 0;
        }

        const rollback = await performRollback(
          { gitTool, codeExecTool, eventBus: globalEventBus, engine },
          { trackId, repo, worktreePath, commitHash, reason: verdict.reason || 'simulated health-check failure' }
        );

        await gitTool.execute({ action: 'cleanup_worktree', trackId });

        if (!rollback.reverted) {
          console.error(`[Deploy Test] Revert failed: ${rollback.error}`);
          return 1;
        }

        console.log(`[Deploy Test] Auto-revert succeeded. Remediation track opened: ${rollback.remediationTrackId}`);
        return 0;
      } catch (err: any) {
        console.error(`[Deploy Test] Execution error: ${err.message}`);
        return 1;
      }
    }

    case 'run': {
      const repo = parsed.values.repo;
      const issueStr = parsed.values.issue;

      if (!repo || !issueStr) {
        console.error('Error: "run" command requires --repo <owner/repo> and --issue <number>');
        return 1;
      }

      const issueNumber = parseInt(issueStr, 10);
      if (isNaN(issueNumber)) {
        console.error(`Error: Invalid issue number: ${issueStr}`);
        return 1;
      }

      try {
        const config = loadConfig();
        const githubTool = globalRegistry.getTool<any, any>('github') as GithubTool;
        console.log(`[Lodestar] Fetching issue #${issueNumber} from ${repo}...`);

        let issueTitle = `Issue #${issueNumber}`;
        let issueBody = 'Auto-fetched task';

        const issueRes = await githubTool.execute({
          action: 'get_issue',
          repo,
          issueNumber,
        });

        if (issueRes.success && issueRes.data) {
          issueTitle = (issueRes.data as any).title;
          issueBody = (issueRes.data as any).body;
        }

        const engine = new TrackEngine(globalEventBus, globalRegistry);
        const trackId = `track_${Date.now()}`;
        const signedGuard1 = parsed.values['sign-guard-1'] || config.teamMode === 'solo';
        const provider = parsed.values.provider || config.primaryAutoCoder;

        console.log(`[Lodestar] Starting track ${trackId} for "${issueTitle}" via provider "${provider}"...`);
        const result = await engine.executeTrack({
          trackId,
          repo,
          issueNumber,
          issueTitle,
          issueBody,
          provider,
          stopSlopProvider: config.relayStopSlopProvider,
          testCommand: parsed.values['test-cmd'],
          signedGuard1,
        });

        if (result.success) {
          console.log(`[Lodestar] Track ${trackId} completed successfully in ${result.cycleTimeMs}ms!`);
          console.log(`[Lodestar] Pull Request: ${result.prUrl}`);
          return 0;
        } else {
          console.error(`[Lodestar] Track ${trackId} failed: ${result.error}`);
          return 1;
        }
      } catch (err: any) {
        console.error(`[Lodestar] Execution error: ${err.message}`);
        return 1;
      }
    }

    case 'worker': {
      const repo = parsed.values.repo;
      const job = parsed.values.job;

      if (!repo || !job) {
        console.error('Error: "worker" command requires --job <job-type> and --repo <owner/repo>');
        return 1;
      }

      try {
        const config = loadConfig();
        const provider = parsed.values.provider || config.primaryAutoCoder;
        const sendHeartbeat = () => process.send?.({ type: 'heartbeat', rssMb: Math.round(process.memoryUsage().rss / 1e6), cpuPct: 0 });

        console.log(`[Worker] Starting ${job} worker for ${repo} via provider "${provider}"...`);

        if (job === 'behavior-monitor') {
          if (!config.clarityApiToken) {
            console.error('Error: "behavior-monitor" requires CLARITY_API_TOKEN (Clarity → Settings → Data Export)');
            return 1;
          }
          const githubTool = globalRegistry.getTool<any, any>('github') as GithubTool;

          await runBehaviorMonitorLoop(
            {
              githubTool,
              repo,
              clarityApiToken: config.clarityApiToken,
              thresholds: {
                minRageClicks: config.clarityMinRageClicks,
                minDeadClicks: config.clarityMinDeadClicks,
                minJsExceptions: config.clarityMinJsExceptions,
                minQuickBacks: config.clarityMinQuickBacks,
                minExcessiveScroll: config.clarityMinExcessiveScroll,
                minFrustrationScore: config.clarityMinFrustrationScore,
                lookbackHours: config.clarityLookbackHours,
              },
              eventBus: globalEventBus,
            },
            {
              intervalMs: (Number(process.env.POLL_INTERVAL_SECONDS) || (config.clarityBatchIntervalHours * 3600)) * 1000,
              onHeartbeat: sendHeartbeat,
            }
          );
          return 0;
        }

        if (job !== 'issue-monitor') {
          console.log(`[Worker] Job type "${job}" has no autonomous polling logic yet — idling with heartbeat only.`);
          while (true) {
            sendHeartbeat();
            await new Promise(r => setTimeout(r, (Number(process.env.POLL_INTERVAL_SECONDS) || 60) * 1000));
          }
        }

        const githubTool = globalRegistry.getTool<any, any>('github') as GithubTool;
        const engine = new TrackEngine(globalEventBus, globalRegistry);

        await runIssueMonitorLoop(
          {
            githubTool,
            engine,
            repo,
            labels: config.issueLabelFilter,
            provider,
            stopSlopProvider: config.relayStopSlopProvider,
            signedGuard1: config.teamMode === 'solo',
            baseDir: process.cwd(),
          },
          {
            intervalMs: (Number(process.env.POLL_INTERVAL_SECONDS) || 60) * 1000,
            onHeartbeat: sendHeartbeat,
          }
        );

        return 0;
      } catch (err: any) {
        console.error(`[Worker] Execution error: ${err.message}`);
        return 1;
      }
    }

    case 'daemon': {
      try {
        const config = loadConfig();

        if (config.githubRepos.length === 0) {
          console.error('Error: "daemon" command requires GITHUB_REPO to list at least one owner/repo');
          return 1;
        }
        if (config.fleetAgents.length === 0) {
          console.error('Error: "daemon" command requires AGENT_N_PROVIDER/AGENT_N_JOB pairs configured');
          return 1;
        }

        const fleetDb = new FleetDb(process.env.FLEET_DB_PATH || `${config.dataDir}/fleet.sqlite`);
        const supervisor = new Supervisor(fleetDb, globalEventBus);

        for (const repo of config.githubRepos) {
          for (const agent of config.fleetAgents) {
            const workerName = `${agent.name}-${repo.replace(/\W+/g, '-')}`;
            console.log(`[Daemon] Starting worker ${workerName} (${agent.job} via ${agent.provider}) for ${repo}...`);
            supervisor.start({ name: workerName, job: agent.job, provider: agent.provider, repo });
          }
        }

        setInterval(() => supervisor.checkAndResumeHolds(), (Number(process.env.POLL_INTERVAL_SECONDS) || 60) * 1000);

        console.log(`[Daemon] Fleet running: ${config.githubRepos.length} repo(s) x ${config.fleetAgents.length} agent(s).`);
        return await new Promise<number>(() => {});
      } catch (err: any) {
        console.error(`[Daemon] Execution error: ${err.message}`);
        return 1;
      }
    }

    case 'dashboard': {
      try {
        const config = loadConfig(parsed.values.port ? { PORT: parsed.values.port } : undefined);
        mkdirSync(config.dataDir, { recursive: true });

        const authService = new AuthService(openAuthDb(nodePath.join(config.dataDir, 'auth.db')));
        if (config.dashboardAdminPassword) authService.setPassword('admin', config.dashboardAdminPassword);
        if (config.dashboardDeveloperPassword) authService.setPassword('developer', config.dashboardDeveloperPassword);

        // Known seed credentials must never be reachable from the network.
        const defaults = authService.accountsWithDefaultPasswords();
        const hostname = defaults.length > 0 ? '127.0.0.1' : undefined;
        if (hostname) {
          console.warn(`[Dashboard] Account(s) ${defaults.join(', ')} still use their default password, so the dashboard binds to 127.0.0.1 only. Set DASHBOARD_ADMIN_PASSWORD / DASHBOARD_DEVELOPER_PASSWORD to serve on all interfaces.`);
        }

        const server = createDashboardServer({
          registry: globalRegistry,
          eventBus: globalEventBus,
          fleetDb: new FleetDb(process.env.FLEET_DB_PATH || `${config.dataDir}/fleet.sqlite`),
          memoryBackend: await createKnowledgeBackend(config),
          authService,
          config,
          baseDir: process.cwd(),
          hostname,
        });

        console.log(`[Dashboard] Listening on http://${server.hostname}:${server.port}`);
        return await new Promise<number>(() => {});
      } catch (err: any) {
        console.error(`[Dashboard] Startup error: ${err.message}`);
        return 1;
      }
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

// Auto-run if invoked directly from CLI
if (import.meta.main) {
  main().then(code => process.exit(code));
}
