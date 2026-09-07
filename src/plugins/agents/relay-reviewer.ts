import type { Tool } from '../../core/interfaces/tool-interface.ts';
import type { CodeExecArgs, CodeExecOutput } from '../tools/code-exec-tool.ts';

export interface ReviewerResult {
  verdict: 'PASS' | 'FAIL';
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function runReviewer(
  codeExecTool: Tool<CodeExecArgs, CodeExecOutput>,
  testCommand: string,
  worktreePath: string
): Promise<ReviewerResult> {
  const testRes = await codeExecTool.execute({ command: testCommand, cwd: worktreePath });

  if (!testRes.success) {
    return { verdict: 'FAIL', error: testRes.error, stdout: testRes.data?.stdout, stderr: testRes.data?.stderr };
  }

  return { verdict: 'PASS', stdout: testRes.data?.stdout, stderr: testRes.data?.stderr };
}
