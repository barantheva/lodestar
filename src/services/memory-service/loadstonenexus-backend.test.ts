import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LoadstoneNexusBackend } from './loadstonenexus-backend';

describe('LoadstoneNexusBackend', () => {
  const testDir = path.join(process.cwd(), '.test-loadstonenexus-' + Date.now());
  let backend: LoadstoneNexusBackend;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    backend = new LoadstoneNexusBackend({
      mode: 'local',
      dataDir: testDir,
    });
  });

  afterEach(async () => {
    backend.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('fails if remote mode is missing url', () => {
    expect(() => new LoadstoneNexusBackend({ mode: 'remote', dataDir: testDir })).toThrow(
      'LOADSTONENEXUS_MCP_URL is required when mode is remote'
    );
  });

  it('persists and retrieves knowledge in local mode', async () => {
    const res1 = await backend.persist_knowledge('repo-map', { repo: 'apache/casbin-gateway', astNodes: 42 });
    expect(res1.id).toBeDefined();

    const res2 = await backend.persist_knowledge('repo-map', {
      id: 'custom-id',
      repo: 'hanoi-rainbow',
      astNodes: 100,
    });
    expect(res2.id).toBe('custom-id');

    const all = await backend.retrieve_knowledge('repo-map');
    expect(all).toHaveLength(2);

    const filtered = await backend.retrieve_knowledge('repo-map', { repo: 'hanoi-rainbow' });
    expect(filtered).toHaveLength(1);
    expect((filtered[0] as { astNodes: number }).astNodes).toBe(100);

    const empty = await backend.retrieve_knowledge('non-existent');
    expect(empty).toHaveLength(0);
  });

  it('persists decisions into db and markdown file', async () => {
    await backend.persist_decision('track-101', 'Approved new auth architecture', ['auth', 'security']);

    const fileContent = await fs.readFile(path.join(testDir, 'decisions', 'decisions.md'), 'utf-8');
    expect(fileContent).toContain('[Track: `track-101`]');
    expect(fileContent).toContain('Approved new auth architecture');
    expect(fileContent).toContain('tags: auth, security');
  });

  it('persists and retrieves guard documents with sha256 checksums', async () => {
    const intentContent = '# Intent\nTrack 202 intent content';
    await backend.persist_guard_document('track-202', 'intent', intentContent, 'analyst-bob');

    const specContent = '# Spec\nTrack 202 spec content';
    await backend.persist_guard_document('track-202', 'spec', specContent);

    const docs = await backend.retrieve_guard_document('track-202');
    expect(docs).toHaveLength(2);
    expect(docs[0].kind).toBe('intent');
    expect(docs[0].signedBy).toBe('analyst-bob');
    expect(docs[0].sha256).toBeDefined();

    const specDoc = await backend.retrieve_guard_document('track-202', 'spec');
    expect(specDoc).toHaveLength(1);
    expect(specDoc[0].content).toBe(specContent);

    // Verify file on disk
    const savedFile = await fs.readFile(path.join(testDir, 'guard-documents', 'track-202', 'intent.md'), 'utf-8');
    expect(savedFile).toBe(intentContent);
  });

  it('supports remote mode calls through mock http server', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as { params?: { name: string; arguments: Record<string, unknown> } };
        const tool = body.params?.name;
        if (tool === 'persist_knowledge') {
          return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify({ id: 'remote-1' }) }] } });
        }
        if (tool === 'retrieve_knowledge') {
          return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify([{ id: 'remote-1' }]) }] } });
        }
        if (tool === 'persist_decision') {
          return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }] } });
        }
        if (tool === 'persist_guard_document') {
          return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }] } });
        }
        if (tool === 'retrieve_guard_document') {
          return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify([{ kind: 'plan', content: 'remote-plan' }]) }] } });
        }
        return Response.json({ jsonrpc: '2.0', id: 1, result: { ok: true } });
      },
    });

    const remoteBackend = new LoadstoneNexusBackend({
      mode: 'remote',
      dataDir: testDir,
      mcpUrl: `http://localhost:${server.port}`,
    });

    const res = await remoteBackend.persist_knowledge('test', { foo: 'bar' });
    expect(res.id).toBe('remote-1');

    const ret = await remoteBackend.retrieve_knowledge('test');
    expect(ret).toHaveLength(1);

    await remoteBackend.persist_decision('track-3', 'remote decision', ['test']);
    await remoteBackend.persist_guard_document('track-3', 'plan', 'remote plan');

    const guardDocs = await remoteBackend.retrieve_guard_document('track-3');
    expect(guardDocs[0].content).toBe('remote-plan');

    remoteBackend.close();
    server.stop(true);
  });
});
