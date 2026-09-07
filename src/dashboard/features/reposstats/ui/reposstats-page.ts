import type { RepoStatsData } from '../use-cases/get-repo-stats.ts';

export function renderRepoStatsPage(data: RepoStatsData): string {
  if (data.repos.length === 0) {
    return `<div class="card"><div class="empty-state">No repositories configured — set <code>GITHUB_REPO</code> to see per-repo stats.</div></div>`;
  }

  const rows = data.repos
    .map(r => `<tr><td>${r.repo}</td><td>${r.shipped}</td><td>${r.inProgress}</td><td>${r.guard1Pending}</td></tr>`)
    .join('\n');

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">📁</span><span class="card-title">All Monitored Repositories</span></div>
        <div><span class="card-stat">${data.repos.length}</span><span class="card-stat-label"> · REPOS</span></div>
      </div>
      <table class="worker-table">
        <thead><tr><th>Repository</th><th>Shipped</th><th>In progress</th><th>Guard 1 pending</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="card-footer">
        <span>Org totals live on <a href="/stats" class="guard-doc-link">My Stats</a> — this splits the same real data per repo</span>
        <span>Source: <code>flight-deck/tracks/*</code></span>
      </div>
    </div>
  `;
}
