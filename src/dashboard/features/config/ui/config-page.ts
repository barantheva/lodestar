import type { ConfigView } from '../use-cases/get-config-view.ts';

function row(label: string, desc: string, value: string): string {
  return `<div class="settings-row"><div><div class="settings-label">${label}</div><div class="settings-desc">${desc}</div></div><input class="settings-input" value="${value}" disabled></div>`;
}

export function renderConfigPage(view: ConfigView): string {
  const providerRows = view.providerKeys
    .map(p => `<div class="gateway-row"><span>${p.provider}</span><span class="badge-pill ${p.set ? 'badge-green' : ''}">${p.set ? 'set' : 'not set'}</span></div>`)
    .join('\n');

  const gatewayRows = view.gateways
    .map(g => `<div class="gateway-row"><span>${g.name}</span><span class="badge-pill ${g.connected ? 'badge-green' : ''}">${g.connected ? 'connected' : 'not configured'}</span></div>`)
    .join('\n');

  const fleetRows = view.fleetAgents
    .map(a => `<tr><td>${a.name}</td><td>${a.job}</td><td>${a.provider}</td></tr>`)
    .join('\n');

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🔧</span><span class="card-title">Environment</span></div></div>
      ${row('TEAM_MODE', 'solo or team', view.teamMode)}
      ${view.teamMode === 'team' ? row('ANALYST_NAME', 'Guard 1 human signer (team mode)', view.analystName || '(not set)') : ''}
      ${view.teamMode === 'team' ? row('LEAD_NAME', 'Guard 3 human signer (team mode)', view.leadName || '(not set)') : ''}
      ${row('GITHUB_TOKEN', 'Masked — presence only', view.githubTokenSet ? 'set' : 'not set')}
      ${row('GITHUB_REPO', 'Comma-separated owner/repo list', view.githubRepos.join(', ') || '(none configured)')}
      ${row('AGENT_COUNT', 'Fleet worker count', String(view.agentCount))}
      ${row('PRIMARY_AUTO_CODER', 'Default provider', view.primaryAutoCoder)}
      <div class="card-footer"><span>Editing isn't wired yet — this is a real read-only view of the loaded config</span></div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🔑</span><span class="card-title">Provider API Keys</span></div></div>
      ${providerRows}
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📚</span><span class="card-title">Knowledge Backend</span></div></div>
      ${row('KNOWLEDGE_BACKEND', 'loadstonenexus or obsidian', view.knowledgeBackend)}
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📡</span><span class="card-title">Organizational Gateways</span></div></div>
      ${gatewayRows}
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🤖</span><span class="card-title">Agent Fleet Defaults</span></div></div>
      ${view.fleetAgents.length === 0
        ? `<div class="empty-state">No AGENT_N_PROVIDER/AGENT_N_JOB pairs configured.</div>`
        : `<table class="worker-table"><thead><tr><th>Agent</th><th>Job</th><th>Provider</th></tr></thead><tbody>${fleetRows}</tbody></table>`}
      <div class="card-footer"><span>Same assignment is live-editable on the <a href="/fleet" class="guard-doc-link">My Fleet</a> screen</span></div>
    </div>
  `;
}
