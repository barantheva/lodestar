import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { KnowledgeBackend } from '../../core/interfaces/memory-interface';

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'method';
  file: string;
  line: number;
  signature?: string;
  exported?: boolean;
}

export interface RepoGraphMap {
  repo: string;
  updatedAt: number;
  symbols: CodeSymbol[];
  fileTree: string[];
  edges: Array<{ from: string; to: string; type: 'calls' | 'imports' | 'extends' }>;
}

export class GraphMemory {
  constructor(private readonly memoryService?: KnowledgeBackend) {}

  /**
   * Checks if codegraph binary or graft CLI is available on PATH.
   */
  hasCodeGraphCli(): boolean {
    try {
      execSync('which codegraph || which graft', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract AST symbols from a TypeScript / JavaScript source file using regex parser.
   */
  parseSourceSymbols(filePath: string, content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const isExported = /\bexport\s+/.test(line);

      // Match interface
      const interfaceMatch = line.match(/\b(?:export\s+)?interface\s+([A-Za-z0-9_]+)/);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: isExported,
        });
        continue;
      }

      // Match type
      const typeMatch = line.match(/\b(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: isExported,
        });
        continue;
      }

      // Match class
      const classMatch = line.match(/\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: isExported,
        });
        continue;
      }

      // Match function
      const fnMatch = line.match(/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          kind: 'function',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: isExported,
        });
        continue;
      }

      // Match const / let function assignment or object
      const constFnMatch = line.match(/\b(?:export\s+)?(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/);
      if (constFnMatch) {
        symbols.push({
          name: constFnMatch[1],
          kind: 'function',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: isExported,
        });
        continue;
      }

      // Match exported const
      const constMatch = line.match(/\bexport\s+const\s+([A-Za-z0-9_]+)\b/);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'const',
          file: filePath,
          line: lineNum,
          signature: line.trim(),
          exported: true,
        });
      }
    }

    return symbols;
  }

  /**
   * Scan all supported source files in target directory.
   */
  async buildRepoGraph(rootDir: string, repoName = 'default-repo'): Promise<RepoGraphMap> {
    const symbols: CodeSymbol[] = [];
    const fileTree: string[] = [];
    const edges: RepoGraphMap['edges'] = [];

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(rootDir, fullPath);

        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'coverage' ||
            entry.name.startsWith('.test-')
          ) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            fileTree.push(relPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const syms = self.parseSourceSymbols(relPath, content);
            symbols.push(...syms);

            // Simple import detection for edges
            const importMatches = content.matchAll(/\bimport\s+.*?from\s+['"]([^'"]+)['"]/g);
            for (const match of importMatches) {
              edges.push({
                from: relPath,
                to: match[1],
                type: 'imports',
              });
            }
          }
        }
      }
    }

    const self = this;
    await walk(rootDir);

    const graphMap: RepoGraphMap = {
      repo: repoName,
      updatedAt: Date.now(),
      symbols,
      fileTree,
      edges,
    };

    if (this.memoryService) {
      await this.memoryService.persist_knowledge('repo-graphs', {
        id: repoName,
        ...graphMap,
      });
    }

    return graphMap;
  }

  /**
   * Find symbol by name or substring across known symbols.
   */
  findSymbols(graph: RepoGraphMap, query: string): CodeSymbol[] {
    const lower = query.toLowerCase();
    return graph.symbols.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.file.toLowerCase().includes(lower)
    );
  }

  /**
   * Find all files importing a given module path.
   */
  findImporters(graph: RepoGraphMap, modulePath: string): string[] {
    return graph.edges
      .filter((e) => e.type === 'imports' && (e.to === modulePath || e.to.includes(modulePath)))
      .map((e) => e.from);
  }

  /**
   * Query graph from memory service if cached.
   */
  async getCachedGraph(repoName: string): Promise<RepoGraphMap | null> {
    if (!this.memoryService) return null;
    const items = await this.memoryService.retrieve_knowledge('repo-graphs', { repo: repoName });
    if (items.length === 0) return null;
    return items[0] as RepoGraphMap;
  }
}
