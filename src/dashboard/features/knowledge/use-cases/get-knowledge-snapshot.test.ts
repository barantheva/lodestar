import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getKnowledgeSnapshot } from './get-knowledge-snapshot.ts';
import { GraphMemory } from '../../../../plugins/memory/graph-memory.ts';
import { LoadstoneNexusBackend } from '../../../../services/memory-service/loadstonenexus-backend.ts';
import { loadConfig } from '../../../../config/index.ts';

describe('getKnowledgeSnapshot', () => {
  const testDataDir = path.join(process.cwd(), '.test-knowledge-data-' + Date.now());
  let memoryBackend: LoadstoneNexusBackend;

  afterEach(async () => {
    memoryBackend?.close();
    await fs.rm(testDataDir, { recursive: true, force: true });
  });

  it('returns a null graph honestly when no repo has been indexed yet', async () => {
    memoryBackend = new LoadstoneNexusBackend({ mode: 'local', dataDir: testDataDir });
    const config = loadConfig({ GITHUB_TOKEN: 'x' });

    const snapshot = await getKnowledgeSnapshot({ config, memoryBackend });

    expect(snapshot.graph).toBeNull();
  });

  it('returns the real cached graph once init-knowledge has indexed a repo', async () => {
    memoryBackend = new LoadstoneNexusBackend({ mode: 'local', dataDir: testDataDir });
    const graphMemory = new GraphMemory(memoryBackend);
    await graphMemory.buildRepoGraph(process.cwd(), 'owner/repo');

    const config = loadConfig({ GITHUB_TOKEN: 'x', GITHUB_REPO: 'owner/repo' });
    const snapshot = await getKnowledgeSnapshot({ config, memoryBackend });

    expect(snapshot.graph).not.toBeNull();
    expect(snapshot.repo).toBe('owner/repo');
  });
});
