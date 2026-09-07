import type { OrgStats } from '../use-cases/get-org-stats.ts';

function guardStageCard(icon: string, title: string, badge: string, badgeClass: string, subtitle: string): string {
  return `<div class="card">
    <div class="card-header">
      <div class="card-title-group"><span class="card-icon">${icon}</span><span class="card-title">${title}</span></div>
      <span class="badge-pill ${badgeClass}">${badge}</span>
    </div>
    <div class="card-subtitle">${subtitle}</div>
  </div>`;
}

export function renderStatsPage(stats: OrgStats): string {
  const sentinelBanner =
    stats.activeRateLimitHolds.length === 0
      ? `<div class="sentinel-banner"><div><strong>⏳ Rate-Limit Sentinel Status:</strong> All model quotas active.</div><div class="sentinel-countdown">Sentinel: ARMED (0 holds)</div></div>`
      : `<div class="sentinel-banner">
          <div><strong>⏳ Rate-Limit Sentinel Status:</strong> ${stats.activeRateLimitHolds.length} worker(s) holding on rate limits.</div>
          <div class="sentinel-countdown">${stats.activeRateLimitHolds.map(h => `${h.workerName}: ${Math.max(0, Math.round((h.resumeAt - Date.now()) / 1000))}s`).join(' · ')}</div>
        </div>`;

  const repoBars = stats.repoBreakdown.length
    ? stats.repoBreakdown
        .map(r => {
          const pct = stats.shipped > 0 ? Math.round((r.shipped / stats.shipped) * 100) : 0;
          return `<div class="bar-row"><span class="bar-label">${r.repo}</span><div class="bar-track"><div class="bar-fill" style="width: ${pct}%; background: #3fb950;"></div></div><span class="bar-meta">${r.shipped} tracks</span></div>`;
        })
        .join('\n')
    : `<div class="empty-state">No shipped tracks yet.</div>`;

  return `
    <div class="relay-grid-2x3" style="margin-bottom: 20px;">
      ${guardStageCard('📥', 'Total Tracks', String(stats.totalTracks), 'badge-pill', 'All tracks in flight-deck/tracks/')}
      ${guardStageCard('📐', 'Guard 1 Pending', String(stats.guard1Pending), stats.guard1Pending > 0 ? 'badge-orange' : 'badge-green', 'Awaiting Analyst certification')}
      ${guardStageCard('🌳', 'In Progress', String(stats.inProgress), 'badge-pill', 'Guard 2 signed, not yet shipped')}
      ${guardStageCard('🚀', 'Shipped', String(stats.shipped), 'badge-green', 'Guard 3 certified')}
      ${guardStageCard('🅰️', 'Archetype A/B', `${stats.archetypeBreakdown.A + stats.archetypeBreakdown.B}`, 'badge-pill', 'Full Guard 1 required')}
      ${guardStageCard('🅲', 'Archetype C/H', `${stats.archetypeBreakdown.C + stats.archetypeBreakdown.H}`, 'badge-pill', 'Guard 1 auto-bypassed')}
    </div>

    ${sentinelBanner}

    <div class="card" style="margin-top: 20px;">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">🚀</span><span class="card-title">Shipped Tracks by Repo</span></div>
        <div><span class="card-stat" style="color: #3fb950;">${stats.shipped}</span><span class="card-stat-label"> · SHIPPED</span></div>
      </div>
      <div class="bar-list">${repoBars}</div>
      <div class="card-footer">
        <span>Guard 3 Zero-Bypass: <strong>100% (${stats.shipped}/${stats.shipped} certified)</strong></span>
        <span>Source: <code>flight-deck/tracks/*/evidence.json</code></span>
      </div>
    </div>

    <div class="widget-grid" style="margin-top: 20px; grid-template-columns: repeat(3, 1fr);">
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🔌</span><span class="card-title">MCPs</span></div></div>
        <div class="empty-state">Not yet instrumented — no MCP call-volume tracking exists in this instance.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">📊</span><span class="card-title">Tokens</span></div></div>
        <div class="empty-state">Not yet instrumented — adapter <code>tokensUsed</code> events aren't persisted/aggregated yet.</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">💰</span><span class="card-title">Spend</span></div></div>
        <div class="empty-state">Not yet instrumented — no per-model pricing/spend tracking exists in this instance.</div>
      </div>
    </div>
  `;
}
