import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { GraphMemory } from './graph-memory';
import { LoadstoneNexusBackend } from '../../services/memory-service/loadstonenexus-backend';

describe('GraphMemory', () => {
  const testDir = path.join(process.cwd(), '.test-graph-mem-' + Date.now());
  const dataDir = path.join(process.cwd(), '.test-data-graph-' + Date.now());
  let memoryBackend: LoadstoneNexusBackend;
  let graphMemory: GraphMemory;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    memoryBackend = new LoadstoneNexusBackend({
      mode: 'local',
      dataDir,
    });
    graphMemory = new GraphMemory(memoryBackend);
  });

  afterEach(async () => {
    memoryBackend.close();
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('checks for codegraph or graft CLI presence without throwing', () => {
    const hasCli = graphMemory.hasCodeGraphCli();
    expect(typeof hasCli).toBe('boolean');
  });

  it('parses TypeScript AST symbols accurately using fallback regex parser', () => {
    const code = `
      import { foo } from './utils';
      export interface UserProfile {
        id: string;
      }
      export type Status = 'active' | 'inactive';
      export class AuthManager {
        login() {}
      }
      export async function calculateMetrics(a: number): Promise<number> {
        return a * 2;
      }
      const helper = (x: number) => x + 1;
      export const CONSTANT_VAL = 42;
    `;

    const symbols = graphMemory.parseSourceSymbols('src/test.ts', code);
    expect(symbols.length).toBe(6);

    const names = symbols.map((s) => s.name);
    expect(names).toContain('UserProfile');
    expect(names).toContain('Status');
    expect(names).toContain('AuthManager');
    expect(names).toContain('calculateMetrics');
    expect(names).toContain('helper');
    expect(names).toContain('CONSTANT_VAL');

    const iface = symbols.find((s) => s.name === 'UserProfile')!;
    expect(iface.kind).toBe('interface');
    expect(iface.exported).toBe(true);
  });

  it('builds full repo graph, parses imports, and caches in memory service', async () => {
    const srcDir = path.join(testDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    await fs.writeFile(
      path.join(srcDir, 'math.ts'),
      `export function add(a: number, b: number) { return a + b; }`
    );

    await fs.writeFile(
      path.join(srcDir, 'index.ts'),
      `import { add } from './math';\nexport class App { run() { return add(1, 2); } }`
    );

    const graph = await graphMemory.buildRepoGraph(testDir, 'my-org/my-repo');
    expect(graph.repo).toBe('my-org/my-repo');
    expect(graph.fileTree).toContain(path.join('src', 'math.ts'));
    expect(graph.fileTree).toContain(path.join('src', 'index.ts'));

    const syms = graphMemory.findSymbols(graph, 'App');
    expect(syms).toHaveLength(1);
    expect(syms[0].kind).toBe('class');

    const importers = graphMemory.findImporters(graph, './math');
    expect(importers).toContain(path.join('src', 'index.ts'));

    const cached = await graphMemory.getCachedGraph('my-org/my-repo');
    expect(cached).not.toBeNull();
    expect(cached?.repo).toBe('my-org/my-repo');
  });

  it('returns null when no memory service is injected or graph is not found', async () => {
    const standalone = new GraphMemory();
    const cached = await standalone.getCachedGraph('unknown');
    expect(cached).toBeNull();
  });
});
