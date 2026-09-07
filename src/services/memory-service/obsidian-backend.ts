import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { KnowledgeBackend, GuardDocumentItem } from '../../core/interfaces/memory-interface';

export interface ObsidianConfig {
  vaultPath?: string;
  apiUrl?: string;
  apiKey?: string;
}

// Ids like 'owner/repo' are the norm here (repo identifiers) but must stay one flat
// filename — a raw '/' would create an extra directory level retrieve_knowledge's
// single-level readdir can't see into.
function safeFilenameId(id: string): string {
  return id.replace(/[/\\]/g, '__');
}

export class ObsidianBackend implements KnowledgeBackend {
  constructor(private readonly config: ObsidianConfig) {}

  private async fetchApi(vaultSubpath: string, options: RequestInit = {}): Promise<Response> {
    if (!this.config.apiUrl) {
      throw new Error('OBSIDIAN_MCP_URL is required for API requests');
    }
    const cleanUrl = this.config.apiUrl.replace(/\/+$/, '');
    const cleanPath = vaultSubpath.replace(/^\/+/, '');
    const url = `${cleanUrl}/vault/${cleanPath}`;

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  async persist_knowledge(collection: string, doc: Record<string, unknown>): Promise<{ id: string }> {
    const id = (doc.id as string) || crypto.randomUUID();
    const payload = JSON.stringify({ ...doc, id }, null, 2);
    const subpath = `knowledge/${collection}/${safeFilenameId(id)}.json`;

    if (this.config.apiUrl) {
      const res = await this.fetchApi(subpath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) {
        throw new Error(`Obsidian API error ${res.status}: ${res.statusText}`);
      }
      return { id };
    }

    if (this.config.vaultPath) {
      const targetFile = path.join(this.config.vaultPath, 'knowledge', collection, `${safeFilenameId(id)}.json`);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, payload, 'utf-8');
      return { id };
    }

    throw new Error('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH must be configured');
  }

  async retrieve_knowledge(collection: string, query?: Record<string, unknown>): Promise<unknown[]> {
    const results: unknown[] = [];

    if (this.config.apiUrl) {
      const res = await this.fetchApi(`knowledge/${collection}/`, { method: 'GET' });
      if (res.status === 404) return [];
      if (!res.ok) {
        throw new Error(`Obsidian API error ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as { files?: string[] };
      const files = data.files || [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const fileRes = await this.fetchApi(`knowledge/${collection}/${f}`, { method: 'GET' });
        if (fileRes.ok) {
          try {
            results.push(await fileRes.json());
          } catch {
            // ignore malformed file
          }
        }
      }
    } else if (this.config.vaultPath) {
      const fullDir = path.join(this.config.vaultPath, 'knowledge', collection);
      try {
        const files = await fs.readdir(fullDir);
        for (const f of files) {
          if (!f.endsWith('.json')) continue;
          const content = await fs.readFile(path.join(fullDir, f), 'utf-8');
          try {
            results.push(JSON.parse(content));
          } catch {
            // ignore malformed file
          }
        }
      } catch {
        return [];
      }
    } else {
      throw new Error('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH must be configured');
    }

    if (!query || Object.keys(query).length === 0) {
      return results;
    }

    return results.filter((item) => {
      for (const [k, v] of Object.entries(query)) {
        if (typeof item === 'object' && item !== null && (item as Record<string, unknown>)[k] !== v) {
          return false;
        }
      }
      return true;
    });
  }

  async persist_decision(trackId: string, quote: string, tags: string[]): Promise<void> {
    const now = new Date().toISOString();
    const entry = `- **[${now}]** [Track: \`${trackId}\`] ${quote} *(tags: ${tags.join(', ')})*\n`;
    const subpath = `decisions/decisions.md`;

    if (this.config.apiUrl) {
      const res = await this.fetchApi(subpath, {
        method: 'POST',
        headers: { 'Content-Type': 'text/markdown' },
        body: entry,
      });
      if (!res.ok) {
        throw new Error(`Obsidian API error ${res.status}: ${res.statusText}`);
      }
      return;
    }

    if (this.config.vaultPath) {
      const fullDir = path.join(this.config.vaultPath, 'decisions');
      await fs.mkdir(fullDir, { recursive: true });
      await fs.appendFile(path.join(fullDir, 'decisions.md'), entry, 'utf-8');
      return;
    }

    throw new Error('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH must be configured');
  }

  async persist_guard_document(
    trackId: string,
    kind: 'intent' | 'spec' | 'design' | 'plan' | 'evidence',
    content: string,
    signedBy?: string
  ): Promise<void> {
    const filename = kind === 'evidence' ? 'guard-evidence.md' : `${kind}.md`;
    const subpath = `guard-documents/${trackId}/${filename}`;

    const header = signedBy ? `<!-- signedBy: ${signedBy} -->\n` : '';
    const fullContent = header + content;

    if (this.config.apiUrl) {
      const res = await this.fetchApi(subpath, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body: fullContent,
      });
      if (!res.ok) {
        throw new Error(`Obsidian API error ${res.status}: ${res.statusText}`);
      }
      return;
    }

    if (this.config.vaultPath) {
      const fullDir = path.join(this.config.vaultPath, 'guard-documents', trackId);
      await fs.mkdir(fullDir, { recursive: true });
      await fs.writeFile(path.join(fullDir, filename), fullContent, 'utf-8');
      return;
    }

    throw new Error('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH must be configured');
  }

  async retrieve_guard_document(trackId: string, kind?: string): Promise<GuardDocumentItem[]> {
    const kindsToFetch = kind
      ? [kind]
      : ['intent', 'spec', 'design', 'plan', 'evidence'];
    const results: GuardDocumentItem[] = [];

    for (const k of kindsToFetch) {
      const filename = k === 'evidence' ? 'guard-evidence.md' : `${k}.md`;
      const subpath = `guard-documents/${trackId}/${filename}`;
      let content: string | null = null;

      if (this.config.apiUrl) {
        const res = await this.fetchApi(subpath, { method: 'GET' });
        if (res.ok) {
          content = await res.text();
        }
      } else if (this.config.vaultPath) {
        const fullPath = path.join(this.config.vaultPath, 'guard-documents', trackId, filename);
        try {
          content = await fs.readFile(fullPath, 'utf-8');
        } catch {
          content = null;
        }
      } else {
        throw new Error('Either OBSIDIAN_MCP_URL or OBSIDIAN_VAULT_PATH must be configured');
      }

      if (content !== null) {
        let signedBy: string | undefined = undefined;
        let cleanContent = content;
        const signMatch = content.match(/^<!-- signedBy: (.*?) -->\n/);
        if (signMatch) {
          signedBy = signMatch[1];
          cleanContent = content.slice(signMatch[0].length);
        }
        const sha256 = crypto.createHash('sha256').update(cleanContent).digest('hex');

        results.push({
          kind: k as GuardDocumentItem['kind'],
          content: cleanContent,
          signedBy,
          sha256,
        });
      }
    }

    return results;
  }
}
