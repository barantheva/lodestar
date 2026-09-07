import type { AgentsLogData } from '../use-cases/get-agents-log.ts';

export function renderAgentsLogPage(data: AgentsLogData): string {
  if (!data.backendConfigured) {
    return `<div class="card"><div class="empty-state">No knowledge backend configured for this dashboard instance — dev-journal entries have nowhere to persist.</div></div>`;
  }

  if (data.entries.length === 0) {
    return `<div class="card"><div class="empty-state">No dev-journal entries yet — nothing in the current track-execution flow calls <code>SessionMemory.persistDevJournal</code> during a run.</div></div>`;
  }

  const lines = data.entries
    .map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      const track = e.trackId ? `<span class="badge-pill">${e.trackId}</span> ` : '';
      const stage = e.stage ? `[${e.stage}] ` : '';
      return `<span class="muted">${time}</span> <span class="ok">[${e.agentName}]</span> ${track}${stage}${e.message}`;
    })
    .join('<br>\n');

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">🗒️</span><span class="card-title">All Agents — Unified Log</span></div>
      </div>
      <div class="card-subtitle">Every entry here is already persisted to the configured knowledge backend (that's the only source this screen reads).</div>
      <div class="log-block" style="max-height: 360px; overflow-y: auto;">${lines}</div>
      <div class="card-footer"><span>Entries: <strong>${data.entries.length}</strong></span></div>
    </div>
  `;
}
