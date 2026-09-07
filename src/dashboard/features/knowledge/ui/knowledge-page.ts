import type { KnowledgeSnapshot } from '../use-cases/get-knowledge-snapshot.ts';

export function renderKnowledgePage(data: KnowledgeSnapshot): string {
  if (!data.graph) {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🌲</span><span class="card-title">Repository Knowledge</span></div></div>
        <div class="empty-state">
          ${data.repo ? `No cached graph for <code>${data.repo}</code> yet.` : 'No repository configured.'}
          Run <code>lodestar init-knowledge --repo ${data.repo || '&lt;owner/repo&gt;'}</code> to populate this screen.
        </div>
      </div>
    `;
  }

  const symbolRows = data.graph.symbols
    .slice(0, 30)
    .map(s => `<li><span class="tree-symbol">${s.name}</span><span class="tree-type">${s.kind} · ${s.file}:${s.line}</span></li>`)
    .join('\n');

  return `
    <div class="widget-grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title-group"><span class="card-icon">🌲</span><span class="card-title">AST Symbol Hierarchy</span></div>
          <span class="card-stat" style="font-size:16px;">${data.graph.symbols.length}</span>
        </div>
        <ul class="tree">${symbolRows}</ul>
        ${data.graph.symbols.length > 30 ? `<div class="card-footer"><span>Showing first 30 of ${data.graph.symbols.length}</span></div>` : ''}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🗺️</span><span class="card-title">File Tree</span></div></div>
        <div class="bar-list">
          ${data.graph.fileTree.slice(0, 15).map(f => `<div class="bar-row"><span class="bar-label">${f}</span></div>`).join('\n')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🗄️</span><span class="card-title">Solution History Vault</span></div></div>
      <div class="empty-state">Nothing has been indexed into a solution-history collection yet — no past-fix reuse tracking exists in this codebase.</div>
      <div class="card-footer">
        <span>Graft runs local-only (stdio, same host as the worker) — see architecture.md §3</span>
        <span>Snapshot cached ${new Date(data.graph.updatedAt).toLocaleString()}, repo: <code>${data.repo}</code></span>
      </div>
    </div>
  `;
}
