import type { AgentAdapter, AgentTask } from '../../core/interfaces/agent-interface.ts';

export interface ImplementerResult {
  success: boolean;
  error?: string;
  rateLimited?: { provider: string; resumeAt: number };
}

export async function runImplementer(adapter: AgentAdapter, task: AgentTask): Promise<ImplementerResult> {
  for await (const event of adapter.dispatch(task)) {
    if (event.type === 'rate_limit') {
      return {
        success: false,
        rateLimited: { provider: adapter.provider, resumeAt: event.resumeAt || Date.now() + 6 * 3600 * 1000 },
      };
    }
    if (event.type === 'error') {
      return { success: false, error: event.error };
    }
  }
  return { success: true };
}
