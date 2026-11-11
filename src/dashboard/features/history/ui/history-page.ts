import type { RunHistoryData } from '../use-cases/get-run-history.ts';
import { escapeHtml } from '../../../../shared/utils/escape-html.ts';

export function renderHistoryPage(data: RunHistoryData): string {
  const rows = data.shippedTracks
    .map(
      t => `<tr>
        <td>${escapeHtml(t.trackId)}</td>
        <td>${t.issueTitle ? escapeHtml(t.issueTitle) : '—'}</td>
        <td>${t.archetype || '—'}</td>
        <td>${t.guard3SignedBy ? escapeHtml(t.guard3SignedBy) : '—'}</td>
        <td><a href="/memories" class="guard-doc-link">📁 view</a></td>
      </tr>`
    )
    .join('\n');

  return `
    <div class="widget-grid" style="margin-bottom: 16px;">
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">💵</span><span class="card-title">Estimated Savings</span></div></div>
        <div class="empty-state">Not yet instrumented — no pricing model exists in this codebase.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">⏱️</span><span class="card-title">Hours Saved</span></div></div>
        <div class="empty-state">Not yet instrumented.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">✅</span><span class="card-title">Tracks Resolved</span></div></div>
        <div class="card-stat" style="font-size: 28px;">${data.shippedTracks.length}</div>
        <div class="card-subtitle">Real count from flight-deck/tracks/</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📜</span><span class="card-title">Run History — Issues Fixed</span></div></div>
      ${data.shippedTracks.length === 0
        ? `<div class="empty-state">No tracks shipped yet.</div>`
        : `<table class="worker-table">
            <thead><tr><th>Track</th><th>Title</th><th>Archetype</th><th>Lead</th><th>Guard docs</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
      <div class="card-footer">
        <span>Incidents/Codebase Findings/Campaigns tabs are empty — only issue-monitor is implemented end-to-end so far</span>
        <span>PR link + gateway-notification delivery aren't tracked anywhere yet</span>
      </div>
    </div>
  `;
}
