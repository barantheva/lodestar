import type { CreateReleasePreview } from '../use-cases/get-create-release-preview.ts';

function draftChangelog(preview: CreateReleasePreview): string {
  if (preview.sinceLastTag.length === 0) {
    return 'No shipped tracks since the last tag.';
  }
  const lines = preview.sinceLastTag.map(t => `- ${t.issueTitle || t.trackId} (${t.trackId}${t.repo ? `, ${t.repo}` : ''})`);
  return `## Issues Fixed\n${lines.join('\n')}`;
}

export function renderCreateReleasePage(preview: CreateReleasePreview): string {
  const changelog = draftChangelog(preview);

  return `
    <form method="POST" action="/release-new">
      <input type="hidden" name="tag" value="${preview.tag}">
      <input type="hidden" name="changelogFilename" value="${preview.changelogFilename}">
      <input type="hidden" name="changelogContent" value="${changelog.replace(/"/g, '&quot;')}">

      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🚀</span><span class="card-title">Create Release</span></div></div>
        <div class="settings-row">
          <div><div class="settings-label">Repository (local checkout)</div><div class="settings-desc">Cut from this checkout's current HEAD — <code>${preview.repoPath}</code>.</div></div>
        </div>
        <div class="settings-row">
          <div><div class="settings-label">Auto-generated tag</div><div class="settings-desc">Format <code>dd-mm-yyyy-&lt;short commit hash&gt;</code> — today's date + HEAD's short SHA (<code>${preview.headShortSha}</code>). Not editable.</div></div>
          <input class="settings-input" value="${preview.tag}" disabled>
        </div>
        <div class="settings-row">
          <div><div class="settings-label">Auto-generated changelog file</div><div class="settings-desc">Committed to <code>changelogs/</code> alongside the tag.</div></div>
          <input class="settings-input" value="${preview.changelogFilename}" disabled>
        </div>
        <div class="card-footer">
          <span>Since last tag${preview.lastTag ? ` (<strong>${preview.lastTag.tag}</strong>)` : ' (no prior tag found)'}: <strong>${preview.sinceLastTag.length} track(s)</strong> shipped</span>
        </div>
      </div>

      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <div class="card-title-group"><span class="card-icon">📝</span><span class="card-title">Changelog Preview</span></div>
          <span class="badge-pill">auto-drafted from real shipped tracks</span>
        </div>
        <div class="log-block" style="white-space: pre-wrap;">${changelog}</div>
        <div class="card-footer">
          <span>Drafted from <code>flight-deck/tracks/*/evidence.json</code> shipped since the last tag</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-group"><span class="card-icon">✅</span><span class="card-title">Confirm &amp; Create</span></div>
          <button class="action-btn primary" type="submit">🚀 Create Release</button>
        </div>
        <div class="card-footer">
          <span>Creates the git tag, writes and commits the changelog — no separate steps</span>
          <span>Gateway notification dispatch isn't wired yet</span>
        </div>
      </div>
    </form>
  `;
}
