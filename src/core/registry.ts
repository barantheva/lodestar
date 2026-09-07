import type { AgentAdapter } from './interfaces/agent-interface.ts';
import type { Tool } from './interfaces/tool-interface.ts';
import type { KnowledgeBackend } from './interfaces/memory-interface.ts';

export class ServiceRegistry {
  private agents: Map<string, AgentAdapter> = new Map();
  private tools: Map<string, Tool<any, any>> = new Map();
  private memoryBackends: Map<string, KnowledgeBackend> = new Map();

  // Agent Adapters
  public registerAgent(adapter: AgentAdapter): void {
    this.agents.set(adapter.provider.toLowerCase(), adapter);
    this.agents.set(adapter.name.toLowerCase(), adapter);
  }

  public getAgent(providerOrName: string): AgentAdapter | undefined {
    return this.agents.get(providerOrName.toLowerCase());
  }

  public unregisterAgent(providerOrName: string): boolean {
    const key = providerOrName.toLowerCase();
    const adapter = this.agents.get(key);
    if (!adapter) return false;

    this.agents.delete(adapter.provider.toLowerCase());
    this.agents.delete(adapter.name.toLowerCase());
    return true;
  }

  public listAgents(): AgentAdapter[] {
    return Array.from(new Set(this.agents.values()));
  }

  // Tools
  public registerTool(tool: Tool<any, any>): void {
    this.tools.set(tool.name.toLowerCase(), tool);
  }

  public getTool<TArgs = Record<string, unknown>, TResult = unknown>(name: string): Tool<TArgs, TResult> | undefined {
    return this.tools.get(name.toLowerCase()) as Tool<TArgs, TResult> | undefined;
  }

  public unregisterTool(name: string): boolean {
    return this.tools.delete(name.toLowerCase());
  }

  public listTools(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  // Memory Backends
  public registerMemory(name: string, backend: KnowledgeBackend): void {
    this.memoryBackends.set(name.toLowerCase(), backend);
  }

  public getMemory(name: string): KnowledgeBackend | undefined {
    return this.memoryBackends.get(name.toLowerCase());
  }

  public unregisterMemory(name: string): boolean {
    return this.memoryBackends.delete(name.toLowerCase());
  }

  public listMemoryBackends(): string[] {
    return Array.from(this.memoryBackends.keys());
  }

  public clear(): void {
    this.agents.clear();
    this.tools.clear();
    this.memoryBackends.clear();
  }
}

export const globalRegistry = new ServiceRegistry();
