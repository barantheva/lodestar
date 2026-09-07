import type { AmpData } from '../use-cases/get-amp-status.ts';

export function renderAmpPage(data: AmpData): string {
  const gatewayRows = data.gateways
    .map(g => `<div class="gateway-row"><span>${g.name} — ${g.detail}</span><span class="badge-pill ${g.connected ? 'badge-green' : ''}">${g.connected ? 'connected' : 'not configured'}</span></div>`)
    .join('\n');

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">🕸️</span><span class="card-title">AMP Peer Mesh</span></div>
        <span class="badge-pill badge-green">${data.nodeCount} instance</span>
      </div>
      <div class="empty-state">
        Multi-machine AMP peer mesh is deferred scope (architecture.md §6/§7) — single-instance is the default target,
        so this instance is the only real node. Workers run as supervised OS processes on it, not separate machines.
      </div>
    </div>

    <div class="widget-grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">✉️</span><span class="card-title">Agent-to-Agent Message Feed</span></div></div>
        <div class="empty-state">No AMP messaging protocol is implemented in this codebase yet — nothing to show.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🛡️</span><span class="card-title">Prompt-Injection Defense</span></div></div>
        <div class="empty-state">No prompt-injection defense subsystem is implemented in this codebase yet.</div>
      </div>
    </div>

    <div class="card" style="margin-top: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📡</span><span class="card-title">Organizational Gateways</span></div></div>
      ${gatewayRows}
      <div class="card-footer" style="margin-top: 10px;">
        <span>Connection status reflects real config (SLACK_WEBHOOK_URL etc.) — dispatch on run outcomes isn't wired yet</span>
        <span>Edit these on the <a href="/config" class="guard-doc-link">Configuration</a> screen</span>
      </div>
    </div>
  `;
}
