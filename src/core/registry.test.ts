import { describe, expect, it } from 'bun:test';
import { ServiceRegistry, globalRegistry } from './registry.ts';
import type { AgentAdapter } from './interfaces/agent-interface.ts';
import type { Tool } from './interfaces/tool-interface.ts';
import type { KnowledgeBackend } from './interfaces/memory-interface.ts';

describe('ServiceRegistry', () => {
  const mockAgent: AgentAdapter = {
    name: 'claude-runner',
    provider: 'claude',
    async *dispatch() {
      yield { type: 'done' };
    },
    async cancel() {},
  };

  const mockTool: Tool<{ cmd: string }, string> = {
    name: 'exec',
    description: 'Runs command',
    parameters: { type: 'object', properties: {} },
    async execute(args) {
      return { success: true, data: args.cmd };
    },
  };

  const mockMemory: KnowledgeBackend = {
    async persist_knowledge() {
      return { id: 'doc-1' };
    },
    async retrieve_knowledge() {
      return [];
    },
    async persist_decision() {},
    async persist_guard_document() {},
    async retrieve_guard_document() {
      return [];
    },
  };

  it('registers and retrieves agent adapters by name and provider', () => {
    const reg = new ServiceRegistry();
    reg.registerAgent(mockAgent);

    expect(reg.getAgent('claude')).toBe(mockAgent);
    expect(reg.getAgent('claude-runner')).toBe(mockAgent);
    expect(reg.listAgents()).toHaveLength(1);

    expect(reg.unregisterAgent('claude')).toBe(true);
    expect(reg.getAgent('claude')).toBeUndefined();
    expect(reg.unregisterAgent('nonexistent')).toBe(false);
  });

  it('registers and retrieves tools', () => {
    const reg = new ServiceRegistry();
    reg.registerTool(mockTool);

    expect(reg.getTool('exec')).toBe(mockTool);
    expect(reg.listTools()).toHaveLength(1);

    expect(reg.unregisterTool('exec')).toBe(true);
    expect(reg.getTool('exec')).toBeUndefined();
  });

  it('registers and retrieves memory backends', () => {
    const reg = new ServiceRegistry();
    reg.registerMemory('loadstonenexus', mockMemory);

    expect(reg.getMemory('loadstonenexus')).toBe(mockMemory);
    expect(reg.listMemoryBackends()).toEqual(['loadstonenexus']);

    expect(reg.unregisterMemory('loadstonenexus')).toBe(true);
    expect(reg.getMemory('loadstonenexus')).toBeUndefined();
  });

  it('clears all components cleanly', () => {
    const reg = new ServiceRegistry();
    reg.registerAgent(mockAgent);
    reg.registerTool(mockTool);
    reg.registerMemory('obsidian', mockMemory);

    reg.clear();
    expect(reg.listAgents()).toHaveLength(0);
    expect(reg.listTools()).toHaveLength(0);
    expect(reg.listMemoryBackends()).toHaveLength(0);
  });

  it('verifies globalRegistry singleton instance', () => {
    expect(globalRegistry).toBeDefined();
    expect(typeof globalRegistry.registerAgent).toBe('function');
  });
});
