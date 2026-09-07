export type AgentEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'rate_limit'
  | 'error'
  | 'done';

export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  sessionId?: string;
  error?: string;
  resumeAt?: number;
  tokensUsed?: {
    input: number;
    output: number;
    cacheReads?: number;
    cacheWrites?: number;
  };
}

export interface AgentTask {
  taskId: string;
  trackId: string;
  repo: string;
  prompt: string;
  worktreePath: string;
  model?: string;
  timeoutMs?: number;
  sessionId?: string;
  systemPrompt?: string;
}

export interface AgentSession {
  sessionId: string;
  taskId: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentAdapter {
  readonly name: string;
  readonly provider: string;
  dispatch(task: AgentTask, sessionId?: string): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
}
