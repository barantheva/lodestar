import type { SetupStatus } from '../use-cases/get-setup-status.ts';

function stepBadge(done: boolean): string {
  return done ? `<span class="badge-pill badge-green">done</span>` : `<span class="badge-pill badge-orange">pending</span>`;
}

export function renderSetupPage(status: SetupStatus): string {
  return `
    <div class="card">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">⚙️</span><span class="card-title">Skill Install</span></div></div>
      <div class="install-step">
        <div class="install-step-num">1</div>
        <div>
          <div class="settings-label">Install the skill ${stepBadge(status.skillInstalled)}</div>
          <div class="settings-desc">Real check: <code>skills/lodestar/SKILL.md</code> ${status.skillInstalled ? 'found' : 'not found'} on disk.</div>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">2</div>
        <div>
          <div class="settings-label">Harness detection</div>
          <div class="settings-desc">Not automated in this codebase yet — verify manually which harnesses (Claude Code, Antigravity, Gemini, Cursor, Codex, OpenCode) have picked up the skill.</div>
        </div>
      </div>
      <div class="install-step">
        <div class="install-step-num">3</div>
        <div>
          <div class="settings-label">Generate .env from .env.example ${stepBadge(status.envGenerated)}</div>
          <div class="settings-desc">Real check: <code>.env</code> ${status.envGenerated ? 'exists' : 'does not exist yet'} at the project root.</div>
        </div>
      </div>
      <div class="card-footer">
        <span>Full configuration lives on the <a href="/config" class="guard-doc-link">Configuration</a> screen</span>
      </div>
    </div>
  `;
}
