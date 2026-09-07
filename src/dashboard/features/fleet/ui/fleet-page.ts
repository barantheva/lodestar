import type { FleetStatusData } from '../use-cases/get-fleet-status.ts';
import type { WorkerState } from '../../../../services/agent-service/fleet-db.ts';

const STATE_DOT: Record<WorkerState, string> = {
  running: 'state-running',
  idle: 'state-idle',
  paused_rate_limited: 'state-paused',
  restarting: 'state-restarting',
  crashed: 'state-crashed',
};

function heartbeatAge(lastHeartbeat?: number): string {
  if (!lastHeartbeat) return '—';
  const secs = Math.round((Date.now() - lastHeartbeat) / 1000);
  return `${secs}s ago`;
}

export function renderFleetPage(data: FleetStatusData): string {
  const rows = data.workers
    .map(
      w => `<tr>
        <td>${w.name}</td>
        <td>${w.job}</td>
        <td>${w.provider}</td>
        <td><span class="state-dot ${STATE_DOT[w.state]}"></span>${w.state}</td>
        <td>${w.pid ?? '—'}</td>
        <td>${w.rssMb ? `${w.rssMb} MB` : '—'}</td>
        <td>${w.cpuPct ?? '—'}</td>
        <td>${heartbeatAge(w.lastHeartbeat)}</td>
        <td>${w.worktree ?? '—'}</td>
      </tr>`
    )
    .join('\n');

  const tableOrEmpty =
    data.workers.length === 0
      ? `<div class="empty-state">No workers registered in the Fleet DB yet — run <code>lodestar daemon</code> to start the fleet supervisor.</div>`
      : `<table class="worker-table">
          <thead><tr><th>Worker</th><th>Job</th><th>Provider</th><th>State</th><th>PID</th><th>RSS</th><th>CPU%</th><th>Heartbeat</th><th>Worktree</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">🤖</span><span class="card-title">Named Worker Processes</span></div>
        <div><span class="card-stat">${data.workers.length}</span><span class="card-stat-label"> · REGISTERED</span></div>
      </div>
      ${tableOrEmpty}
      <div class="card-footer">
        <span>Source: local Fleet DB (SQLite) — never LoadstoneNexus, per architecture.md's local/knowledge split</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📟</span><span class="card-title">Live Stream</span></div></div>
      <div class="log-split">
        <div><div class="log-pane-title">stdout</div><div class="log-pane"><span class="empty-state">Not captured — the supervisor tracks heartbeat via IPC only, not stdout/stderr text.</span></div></div>
        <div><div class="log-pane-title">stderr</div><div class="log-pane"><span class="empty-state">Not captured — same reason.</span></div></div>
      </div>
    </div>
  `;
}
