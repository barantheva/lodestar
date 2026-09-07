import { spawn } from 'node:child_process';
import type { Tool, ToolParameters, ToolResult } from '../../core/interfaces/tool-interface.ts';

export interface CodeExecArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface CodeExecOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export class CodeExecTool implements Tool<CodeExecArgs, CodeExecOutput> {
  public readonly name = 'code-exec';
  public readonly description = 'Executes shell commands or test/build suites in a specified working directory with timeout';

  public readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      cwd: { type: 'string', description: 'Working directory path' },
      timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds (default 120000)' },
    },
    required: ['command'],
  };

  public async execute(
    args: CodeExecArgs,
    context?: { worktreePath?: string; env?: Record<string, string> }
  ): Promise<ToolResult<CodeExecOutput>> {
    const startTime = Date.now();
    const cwd = args.cwd || context?.worktreePath || process.cwd();
    const timeoutMs = args.timeoutMs || 120000;
    const env = { ...process.env, ...context?.env, ...args.env };

    return new Promise<ToolResult<CodeExecOutput>>((resolve) => {
      let isSettled = false;
      let stdout = '';
      let stderr = '';

      const child = spawn(args.command, {
        shell: true,
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          child.kill('SIGKILL');
          const durationMs = Date.now() - startTime;
          resolve({
            success: false,
            error: `Command timed out after ${timeoutMs}ms: ${args.command}`,
            data: { stdout, stderr, exitCode: -1, durationMs },
            rawOutput: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
          });
        }
      }, timeoutMs);

      child.on('error', err => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          resolve({
            success: false,
            error: err.message,
            data: { stdout, stderr, exitCode: -1, durationMs },
            rawOutput: `ERROR:\n${err.message}`,
          });
        }
      });

      child.on('close', code => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          const exitCode = code ?? 0;
          const durationMs = Date.now() - startTime;
          resolve({
            success: exitCode === 0,
            data: { stdout, stderr, exitCode, durationMs },
            error: exitCode !== 0 ? `Command exited with non-zero code ${exitCode}` : undefined,
            rawOutput: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
          });
        }
      });
    });
  }
}
