export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rawOutput?: string;
}

export interface Tool<TArgs = Record<string, unknown>, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
  execute(args: TArgs, context?: { worktreePath?: string; env?: Record<string, string> }): Promise<ToolResult<TResult>>;
}
