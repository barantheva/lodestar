import { Database } from 'bun:sqlite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { KnowledgeBackend, GuardDocumentItem } from '../../core/interfaces/memory-interface';
import { McpClient } from '../../data-access/mcp-client';

// Ids like 'owner/repo' are the norm (repo identifiers) but must stay one flat
// filename when mirrored to disk, not an extra directory level.
function safeFilenameId(id: string): string {
  return id.replace(/[/\\]/g, '__');
}

export interface LoadstoneNexusConfig {
  mode: 'local' | 'remote';
  dataDir: string;
  mcpUrl?: string;
}

export class LoadstoneNexusBackend implements KnowledgeBackend {
  private db: Database | null = null;
  private mcpClient: McpClient | null = null;

  constructor(private readonly config: LoadstoneNexusConfig) {
    if (config.mode === 'local') {
      this.initLocalDb();
    } else {
      if (!config.mcpUrl) {
        throw new Error('LOADSTONENEXUS_MCP_URL is required when mode is remote');
      }
      this.mcpClient = new McpClient({
        mode: 'http',
        url: config.mcpUrl,
      });
    }
  }

  private initLocalDb(): void {
    const dataDir = this.config.dataDir;
    // Ensure dir exists synchronously or asynchronously
    try {
      require('node:fs').mkdirSync(dataDir, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const dbPath = path.join(dataDir, 'loadstonenexus.sqlite');
    this.db = new Database(dbPath);
    this.db.run('PRAGMA journal_mode = WAL;');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        quote TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS guard_documents (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        signed_by TEXT,
        sha256 TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async persist_knowledge(collection: string, doc: Record<string, unknown>): Promise<{ id: string }> {
    if (this.config.mode === 'remote') {
      return this.mcpClient!.callTool<{ id: string }>('persist_knowledge', { collection, doc });
    }

    const id = (doc.id as string) || crypto.randomUUID();
    const now = Date.now();
    const dataStr = JSON.stringify({ ...doc, id });

    // Store in SQLite
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO knowledge_entries (id, collection, data, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, collection, dataStr, now);

    // Markdown/JSON mirror for manual inspection — SQLite above is what retrieve_knowledge reads
    const targetFile = path.join(this.config.dataDir, 'knowledge', collection, `${safeFilenameId(id)}.json`);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, dataStr, 'utf-8');

    return { id };
  }

  async retrieve_knowledge(collection: string, query?: Record<string, unknown>): Promise<unknown[]> {
    if (this.config.mode === 'remote') {
      return this.mcpClient!.callTool<unknown[]>('retrieve_knowledge', { collection, query });
    }

    const rows = this.db!.query(
      `SELECT data FROM knowledge_entries WHERE collection = ? ORDER BY created_at DESC, rowid DESC`
    ).all(collection) as Array<{ data: string }>;

    const items = rows.map((r) => JSON.parse(r.data));

    if (!query || Object.keys(query).length === 0) {
      return items;
    }

    return items.filter((item) => {
      for (const [k, v] of Object.entries(query)) {
        if (typeof item === 'object' && item !== null && (item as Record<string, unknown>)[k] !== v) {
          return false;
        }
      }
      return true;
    });
  }

  async persist_decision(trackId: string, quote: string, tags: string[]): Promise<void> {
    if (this.config.mode === 'remote') {
      await this.mcpClient!.callTool('persist_decision', { trackId, quote, tags });
      return;
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const tagsStr = JSON.stringify(tags);

    const stmt = this.db!.prepare(`
      INSERT INTO decisions (id, track_id, quote, tags, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, trackId, quote, tagsStr, now);

    // Mirror to markdown journal
    const decisionsDir = path.join(this.config.dataDir, 'decisions');
    await fs.mkdir(decisionsDir, { recursive: true });
    const line = `- **[${new Date(now).toISOString()}]** [Track: \`${trackId}\`] ${quote} *(tags: ${tags.join(', ')})*\n`;
    await fs.appendFile(path.join(decisionsDir, 'decisions.md'), line, 'utf-8');
  }

  async persist_guard_document(
    trackId: string,
    kind: 'intent' | 'spec' | 'design' | 'plan' | 'evidence',
    content: string,
    signedBy?: string
  ): Promise<void> {
    if (this.config.mode === 'remote') {
      await this.mcpClient!.callTool('persist_guard_document', { trackId, kind, content, signedBy });
      return;
    }

    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const now = Date.now();
    const id = `${trackId}#${kind}`;

    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO guard_documents (id, track_id, kind, content, signed_by, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, trackId, kind, content, signedBy ?? null, sha256, now);

    // Save markdown file in guard-documents directory
    const docDir = path.join(this.config.dataDir, 'guard-documents', trackId);
    await fs.mkdir(docDir, { recursive: true });
    const filename = kind === 'evidence' ? 'guard-evidence.md' : `${kind}.md`;
    await fs.writeFile(path.join(docDir, filename), content, 'utf-8');
  }

  async retrieve_guard_document(trackId: string, kind?: string): Promise<GuardDocumentItem[]> {
    if (this.config.mode === 'remote') {
      return this.mcpClient!.callTool<GuardDocumentItem[]>('retrieve_guard_document', { trackId, kind });
    }

    let rows: Array<{ kind: string; content: string; signed_by: string | null; sha256: string; created_at: number }>;

    if (kind) {
      rows = this.db!.query(
        `SELECT kind, content, signed_by, sha256, created_at FROM guard_documents WHERE track_id = ? AND kind = ?`
      ).all(trackId, kind) as typeof rows;
    } else {
      rows = this.db!.query(
        `SELECT kind, content, signed_by, sha256, created_at FROM guard_documents WHERE track_id = ? ORDER BY created_at ASC`
      ).all(trackId) as typeof rows;
    }

    return rows.map((r) => ({
      kind: r.kind as GuardDocumentItem['kind'],
      content: r.content,
      signedBy: r.signed_by ?? undefined,
      sha256: r.sha256,
      timestamp: r.created_at,
    }));
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
