import type { AgentAdapter, AgentTask } from '../../core/interfaces/agent-interface.ts';

export interface StopSlopContext {
  trackId: string;
  repo: string;
  worktreePath: string;
  learnings?: string;
}

export interface StopSlopResult {
  verdict: 'PASS' | 'FAIL';
  reasons: string;
}

const VERDICT_MARKER = /VERDICT:\s*(PASS|FAIL)/i;

function buildPrompt(ctx: StopSlopContext): string {
  const learningsBlock = ctx.learnings ? `Known recurring issues from past reviews:\n${ctx.learnings}\n\n` : '';
  return (
    `${learningsBlock}Review the uncommitted changes in this worktree for AI-generated code smells: ` +
    'duplicated reimplementations of existing helpers, dead "for future use" code, speculative abstractions, ' +
    'broad exception swallowing, try-import fallbacks, and narrating comments. ' +
    'Finish your response with exactly one line reading "VERDICT: PASS" or "VERDICT: FAIL".'
  );
}

export async function runStopSlop(adapter: AgentAdapter, ctx: StopSlopContext): Promise<StopSlopResult> {
  const task: AgentTask = {
    taskId: `stop-slop_${ctx.trackId}`,
    trackId: ctx.trackId,
    repo: ctx.repo,
    prompt: buildPrompt(ctx),
    worktreePath: ctx.worktreePath,
  };

  let output = '';
  for await (const event of adapter.dispatch(task)) {
    if (event.type === 'token') output += event.content || '';
    if (event.type === 'error') return { verdict: 'FAIL', reasons: `stop-slop scan errored: ${event.error}` };
  }

  const match = output.match(VERDICT_MARKER);
  if (!match) {
    return { verdict: 'FAIL', reasons: `stop-slop scan produced no verdict marker:\n${output}` };
  }

  return { verdict: match[1].toUpperCase() as 'PASS' | 'FAIL', reasons: output.trim() };
}
