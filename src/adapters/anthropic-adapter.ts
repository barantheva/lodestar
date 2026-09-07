import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentAdapter, AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

export class AnthropicAdapter implements AgentAdapter {
  public readonly name = 'claude-code';
  public readonly provider = 'claude';
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private customSpawner?: typeof spawn;

  constructor(customSpawner?: typeof spawn) {
    this.customSpawner = customSpawner;
  }

  public async *dispatch(task: AgentTask, sessionId?: string): AsyncIterable<AgentEvent> {
    const activeSessionId = sessionId || task.sessionId || `claude_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const spawner = this.customSpawner || spawn;

    const command = 'claude';
    const args = ['--print', task.prompt];

    const child = spawner(command, args, {
      cwd: task.worktreePath || process.cwd(),
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: activeSessionId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.activeProcesses.set(activeSessionId, child);

    let isRateLimited = false;
    let rateLimitResumeAt: number | undefined;
    let totalOutputTokens = 0;

    const streamQueue: AgentEvent[] = [];
    let isChildClosed = false;
    let childError: Error | undefined;

    child.stdout?.on('data', chunk => {
      const text = chunk.toString();
      totalOutputTokens += Math.ceil(text.length / 4);

      if (/rate[- ]limit|429|quota|exceeded/i.test(text)) {
        isRateLimited = true;
        rateLimitResumeAt = Date.now() + 6 * 3600 * 1000; // Default +6h
        streamQueue.push({
          type: 'rate_limit',
          content: text,
          resumeAt: rateLimitResumeAt,
          sessionId: activeSessionId,
        });
      } else {
        streamQueue.push({
          type: 'token',
          content: text,
          sessionId: activeSessionId,
        });
      }
    });

    child.stderr?.on('data', chunk => {
      const text = chunk.toString();
      if (/rate[- ]limit|429|quota|exceeded/i.test(text)) {
        isRateLimited = true;
        rateLimitResumeAt = Date.now() + 6 * 3600 * 1000;
        streamQueue.push({
          type: 'rate_limit',
          error: text,
          resumeAt: rateLimitResumeAt,
          sessionId: activeSessionId,
        });
      } else {
        streamQueue.push({
          type: 'token',
          content: text,
          sessionId: activeSessionId,
        });
      }
    });

    child.on('error', err => {
      childError = err;
      isChildClosed = true;
    });

    child.on('close', () => {
      isChildClosed = true;
      this.activeProcesses.delete(activeSessionId);
    });

    while (!isChildClosed || streamQueue.length > 0) {
      if (streamQueue.length > 0) {
        yield streamQueue.shift()!;
      } else {
        await new Promise(r => setTimeout(r, 10));
      }
    }

    if (childError) {
      yield {
        type: 'error',
        error: childError.message,
        sessionId: activeSessionId,
      };
    } else if (isRateLimited) {
      yield {
        type: 'rate_limit',
        resumeAt: rateLimitResumeAt,
        sessionId: activeSessionId,
      };
    } else {
      yield {
        type: 'done',
        sessionId: activeSessionId,
        tokensUsed: {
          input: Math.ceil(task.prompt.length / 4),
          output: totalOutputTokens,
        },
      };
    }
  }

  public async cancel(sessionId: string): Promise<void> {
    const child = this.activeProcesses.get(sessionId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(sessionId);
    }
  }
}
