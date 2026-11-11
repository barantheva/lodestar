import type { MemoriesData } from '../use-cases/get-memories.ts';
import { escapeHtml } from '../../../../shared/utils/escape-html.ts';

function trackBadge(status: string): string {
  if (status === 'shipped') return `<span class="badge-pill badge-green">Guard 3 certified</span>`;
  if (status === 'in_progress') return `<span class="badge-pill badge-orange">Guard 3 pending</span>`;
  return `<span class="badge-pill">Guard 1 pending</span>`;
}

export function renderMemoriesPage(data: MemoriesData): string {
  const items = data.tracks
    .map(
      t => `<div class="activity-item">
        <div class="activity-header">
          <span class="branch-tag">⌥ ${escapeHtml(t.trackId)}</span>
          ${trackBadge(t.status)}
        </div>
        <div class="activity-meta">
          <span>Guard 1: ${t.guard1SignedBy ? escapeHtml(t.guard1SignedBy) : '—'}</span>
          <span>Guard 2: ${t.guard2SignedBy ? escapeHtml(t.guard2SignedBy) : '—'}</span>
          <span>Guard 3: ${t.guard3SignedBy ? escapeHtml(t.guard3SignedBy) : '—'}</span>
        </div>
      </div>`
    )
    .join('\n');

  return `
    <div class="widget-grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🔍</span><span class="card-title">Branch Recall Ledger</span></div></div>
        <div class="empty-state">No decisions have been persisted via <code>persist_decision</code> yet in this instance — nothing currently calls it in the real track-execution flow.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">💡</span><span class="card-title">Decision Journal (ADR)</span></div></div>
        <div class="empty-state">Same as Branch Recall — populates once decisions get persisted through the knowledge backend.</div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">📁</span><span class="card-title">Guard Document Browser</span></div>
        <div class="card-subtitle" style="margin:0;">${data.tracks.length} real track(s) from <code>flight-deck/tracks/</code></div>
      </div>
      ${data.tracks.length === 0 ? `<div class="empty-state">No tracks yet.</div>` : `<div class="activity-feed">${items}</div>`}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📈</span><span class="card-title">Living Documentation Engine</span></div></div>
      <div class="empty-state">No living-doc generation runs in this codebase yet — nothing to show.</div>
    </div>
  `;
}
