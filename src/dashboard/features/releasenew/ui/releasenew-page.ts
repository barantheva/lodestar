import type { CreateReleasePreview } from '../use-cases/get-create-release-preview.ts';
import { escapeHtml } from '../../../../shared/utils/escape-html.ts';

export function renderCreateReleasePage(preview: CreateReleasePreview): string {
  return `
    <form method="POST" action="/release-new">
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header"><div class="card-title-group"><span class="card-icon">🚀</span><span class="card-title">Create Release</span></div></div>
        <div class="settings-row">
          <div><div class="settings-label">Repository (local checkout)</div><div class="settings-desc">Cut from this checkout's current HEAD — <code>${escapeHtml(preview.repoPath)}</code>.</div></div>
        </div>
        <div class="settings-row">
          <div><div class="settings-label">Auto-generated tag</div><div class="settings-desc">Format <code>dd-mm-yyyy-&lt;short commit hash&gt;</code> — today's date + HEAD's short SHA (<code>${escapeHtml(preview.headShortSha)}</code>). Not editable, and recomputed server-side at submit time.</div></div>
          <input class="settings-input" value="${escapeHtml(preview.tag)}" disabled>
        </div>
        <div class="settings-row">
          <div><div class="settings-label">Auto-generated changelog file</div><div class="settings-desc">Committed to <code>changelogs/</code> alongside the tag.</div></div>
          <input class="settings-input" value="${escapeHtml(preview.changelogFilename)}" disabled>
        </div>
        <div class="card-footer">
          <span>Since last tag${preview.lastTag ? ` (<strong>${escapeHtml(preview.lastTag.tag)}</strong>)` : ' (no prior tag found)'}: <strong>${preview.sinceLastTag.length} track(s)</strong> shipped</span>
        </div>
      </div>

      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <div class="card-title-group"><span class="card-icon">📝</span><span class="card-title">Changelog Preview</span></div>
          <span class="badge-pill">auto-drafted from real shipped tracks</span>
        </div>
        <div class="log-block" style="white-space: pre-wrap;">${escapeHtml(preview.changelogDraft)}</div>
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
