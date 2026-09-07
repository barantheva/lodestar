import type { MonitorSetupData } from '../use-cases/get-monitor-setup.ts';

export function renderMonitorSetupPage(data: MonitorSetupData): string {
  const repoCheckboxes = data.repos.length
    ? data.repos.map(r => `<label style="display:flex; align-items:center; gap:6px; font-size:12px;"><input type="checkbox" name="repos" value="${r}"> ${r}</label>`).join('\n')
    : `<div class="empty-state">No repositories configured — set GITHUB_REPO to select targets for a campaign.</div>`;

  return `
    <div class="sentinel-banner" style="margin-bottom: 16px;">
      <div><strong>📡 Campaign Execution:</strong> ${data.campaignAgentsConfigured} agent(s) configured for <code>instrumentation-campaign</code> job type.</div>
      <div class="sentinel-countdown">${data.campaignAgentsConfigured > 0 ? 'READY' : 'NOT CONFIGURED'}</div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📁</span><span class="card-title">Target Repositories</span></div></div>
      <div style="display: flex; flex-direction: column; gap: 8px;">${repoCheckboxes}</div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🧬</span><span class="card-title">Campaign Change Definition</span></div></div>
      <div class="settings-row"><div><div class="settings-label">Campaign Type</div></div>
        <select class="assign-select">
          <option>SigNoz/OTel wrappers</option>
          <option>Logtail ingestion</option>
          <option>Shared contract migration</option>
          <option>Dependency bump</option>
        </select>
      </div>
      <div class="settings-row"><div><div class="settings-label">Target Symbol / File Pattern</div></div><input class="settings-input" placeholder="src/**/*.ts"></div>
      <div class="settings-row"><div><div class="settings-label">Assigned Model Provider</div></div>
        <select class="assign-select"><option>claude</option><option>deepseek</option><option>gemini</option><option>kimi</option><option>openai</option></select>
      </div>
      <div class="card-footer">
        <span>Instrumentation Campaign fan-out is deferred scope (architecture.md §6/§7, impl.md's Deferred list) — this form isn't wired to real execution yet</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">📊</span><span class="card-title">Batch Execution Status</span></div>
        <button class="action-btn primary" disabled>Run this change</button>
      </div>
      <div class="empty-state">No campaign runs recorded — the fan-out mechanism described in architecture.md §9 hasn't been built yet.</div>
    </div>
  `;
}
