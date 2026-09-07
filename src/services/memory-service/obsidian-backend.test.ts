import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ObsidianBackend } from './obsidian-backend';

describe('ObsidianBackend', () => {
  const testVault = path.join(process.cwd(), '.test-vault-' + Date.now());

  beforeEach(async () => {
    await fs.mkdir(testVault, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testVault, { recursive: true, force: true });
  });

  it('fails if neither apiUrl nor vaultPath is provided', () => {
    const backend = new ObsidianBackend({});
    expect(backend.persist_knowledge('test', {})).rejects.toThrow('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH');
    expect(backend.retrieve_knowledge('test')).rejects.toThrow('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH');
    expect(backend.persist_decision('t1', 'q', [])).rejects.toThrow('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH');
    expect(backend.persist_guard_document('t1', 'plan', 'c')).rejects.toThrow('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH');
    expect(backend.retrieve_guard_document('t1')).rejects.toThrow('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH');
  });

  it('works with local vault filesystem mode', async () => {
    const backend = new ObsidianBackend({ vaultPath: testVault });

    const p1 = await backend.persist_knowledge('rules', { id: 'r1', rule: 'never commit secrets' });
    expect(p1.id).toBe('r1');

    const p2 = await backend.persist_knowledge('rules', { rule: 'use bun test' });
    expect(p2.id).toBeDefined();

    const all = await backend.retrieve_knowledge('rules');
    expect(all).toHaveLength(2);

    const filtered = await backend.retrieve_knowledge('rules', { id: 'r1' });
    expect(filtered).toHaveLength(1);

    await backend.persist_decision('track-42', 'Adopted layered dependency rule', ['arch']);
    const decContent = await fs.readFile(path.join(testVault, 'decisions', 'decisions.md'), 'utf-8');
    expect(decContent).toContain('Adopted layered dependency rule');

    await backend.persist_guard_document('track-42', 'intent', '# Intent 42', 'lead-alice');
    const docs = await backend.retrieve_guard_document('track-42');
    expect(docs).toHaveLength(1);
    expect(docs[0].kind).toBe('intent');
    expect(docs[0].signedBy).toBe('lead-alice');
    expect(docs[0].content).toBe('# Intent 42');

    const specific = await backend.retrieve_guard_document('track-42', 'intent');
    expect(specific).toHaveLength(1);

    const empty = await backend.retrieve_knowledge('non-existent-collection');
    expect(empty).toHaveLength(0);
  });

  it('works with HTTP API mode (mock Obsidian Local REST API)', async () => {
    const store = new Map<string, string>();

    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const auth = req.headers.get('Authorization');
        if (auth !== 'Bearer test-key') {
          return new Response('Unauthorized', { status: 401 });
        }

        const url = new URL(req.url);
        const subpath = url.pathname.replace(/^\/vault\//, '');

        if (req.method === 'PUT' || req.method === 'POST') {
          const body = await req.text();
          store.set(subpath, body);
          return new Response('OK', { status: 200 });
        }

        if (req.method === 'GET') {
          if (subpath.endsWith('/')) {
            const prefix = subpath;
            const files = Array.from(store.keys())
              .filter((k) => k.startsWith(prefix))
              .map((k) => k.slice(prefix.length));
            return Response.json({ files });
          }
          const content = store.get(subpath);
          if (content !== undefined) {
            return new Response(content, { status: 200 });
          }
          return new Response('Not Found', { status: 404 });
        }

        return new Response('Method not allowed', { status: 405 });
      },
    });

    const backend = new ObsidianBackend({
      apiUrl: `http://localhost:${server.port}`,
      apiKey: 'test-key',
    });

    const p = await backend.persist_knowledge('plugins', { name: 'graft' });
    expect(p.id).toBeDefined();

    const list = await backend.retrieve_knowledge('plugins');
    expect(list).toHaveLength(1);

    await backend.persist_decision('track-55', 'API decision', ['tag1']);
    await backend.persist_guard_document('track-55', 'spec', '# Spec 55');

    const docs = await backend.retrieve_guard_document('track-55', 'spec');
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe('# Spec 55');

    server.stop(true);
  });
});
