import type { ReleasesData } from '../use-cases/get-releases.ts';

export function renderReleasesPage(data: ReleasesData): string {
  if (data.tags.length === 0) {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🏷️</span><span class="card-title">Releases</span></div></div>
        <div class="empty-state">No tags cut yet in <code>${data.repoPath}</code>. <a href="/release-new" class="guard-doc-link">Create one →</a></div>
      </div>
    `;
  }

  const rows = data.tags
    .map(t => `<tr><td>${t.tag}</td><td>${t.createdAt}</td><td><code>${t.commit}</code></td></tr>`)
    .join('\n');

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div class="card-title-group"><span class="card-icon">🏷️</span><span class="card-title">Last Created Tag</span></div>
      </div>
      <div class="card-stat" style="font-size: 20px;">${data.tags[0].tag}</div>
      <div class="card-subtitle">${data.tags[0].createdAt}</div>
      <div class="card-footer">
        <span>Tag format: <strong>dd-mm-yyyy-&lt;short commit hash&gt;</strong> — cut from this repo's HEAD</span>
        <span><a href="/release-new" class="guard-doc-link">+ Create a release →</a></span>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📜</span><span class="card-title">All Releases</span></div></div>
      <table class="worker-table">
        <thead><tr><th>Tag</th><th>Created</th><th>Commit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="card-footer">
        <span>Read from real local git tags at <code>${data.repoPath}</code> — one repo checkout, not the whole fleet</span>
        <span>Changelog/notification tracking isn't wired yet</span>
      </div>
    </div>
  `;
}
