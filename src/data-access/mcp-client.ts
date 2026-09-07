import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpClientOptions {
  mode?: 'stdio' | 'http';
  command?: string[];
  url?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export class McpClient {
  private idCounter = 1;
  private pendingRequests = new Map<
    number | string,
    { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private isInitialized = false;

  constructor(private readonly options: McpClientOptions) {}

  async start(): Promise<void> {
    if (this.options.mode === 'http') {
      if (!this.options.url) {
        throw new Error('MCP HTTP mode requires a valid url');
      }
      this.isInitialized = true;
      return;
    }

    // Default to stdio mode
    if (!this.options.command || this.options.command.length === 0) {
      throw new Error('MCP stdio mode requires a command array');
    }

    const [cmd, ...args] = this.options.command;
    this.process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.options.env },
    });

    if (!this.process.stdout) {
      throw new Error('Failed to capture stdout of MCP subprocess');
    }

    this.rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleMessage(response);
      } catch {
        // Ignore unparseable non-JSON logs from MCP stdio
      }
    });

    this.isInitialized = true;
  }

  private handleMessage(response: JsonRpcResponse): void {
    if (response.id === undefined || response.id === null) return;
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`MCP error ${response.error.code}: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  async callMethod<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isInitialized) {
      await this.start();
    }

    const id = this.idCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    if (this.options.mode === 'http') {
      return this.sendHttpRequest<T>(request);
    }

    return this.sendStdioRequest<T>(request, id);
  }

  private async sendHttpRequest<T>(request: JsonRpcRequest): Promise<T> {
    const timeoutMs = this.options.timeoutMs ?? 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(this.options.url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`MCP HTTP request failed with status ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as JsonRpcResponse<T>;
      if (json.error) {
        throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
      }
      return json.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private sendStdioRequest<T>(request: JsonRpcRequest, id: number | string): Promise<T> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP subprocess is not running');
    }

    const timeoutMs = this.options.timeoutMs ?? 10000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout after ${timeoutMs}ms for method ${request.method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });

      const payload = JSON.stringify(request) + '\n';
      try {
        const stdin = this.process!.stdin as unknown as NodeJS.WritableStream;
        stdin.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async callTool<T = unknown>(name: string, argumentsObj: Record<string, unknown> = {}): Promise<T> {
    const res = await this.callMethod<{ content?: Array<{ type: string; text: string }>; isError?: boolean }>(
      'tools/call',
      {
        name,
        arguments: argumentsObj,
      }
    );

    if (res?.isError) {
      const errorText = res.content?.map((c) => c.text).join('\n') || 'Unknown tool error';
      throw new Error(`Tool ${name} failed: ${errorText}`);
    }

    if (res?.content && res.content.length > 0) {
      const text = res.content.map((c) => c.text).join('\n');
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    return res as unknown as T;
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    const res = await this.callMethod<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>(
      'tools/list',
      {}
    );
    return res?.tools || [];
  }

  async stop(): Promise<void> {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('MCP client stopped'));
    }
    this.pendingRequests.clear();

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore kill error
      }
      this.process = null;
    }

    this.isInitialized = false;
  }
}
