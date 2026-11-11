import type { UsersRegistryData } from '../use-cases/get-users-registry.ts';
import { escapeHtml } from '../../../../shared/utils/escape-html.ts';

export function renderUsersPage(data: UsersRegistryData): string {
  const userRows = data.users
    .map(
      u => `<tr>
        <td>${escapeHtml(u.id)}</td>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="badge-pill ${u.role === 'admin' ? 'badge-green' : ''}">${escapeHtml(u.role)}</span></td>
        <td>${u.name ? escapeHtml(u.name) : '—'}</td>
        <td>${u.email ? escapeHtml(u.email) : '—'}</td>
      </tr>`
    )
    .join('\n');

  const sessionRows = data.sessions
    .map(
      s => `<tr>
        <td><code>${escapeHtml(s.token.slice(0, 12))}…</code></td>
        <td>${escapeHtml(s.username)}</td>
        <td>${new Date(s.createdAt).toLocaleString()}</td>
        <td>${Math.max(0, Math.round((s.expiresAt - Date.now()) / 3600_000))}h remaining</td>
        <td>
          <form method="POST" action="/users/revoke-session" style="display:inline;">
            <input type="hidden" name="token" value="${escapeHtml(s.token)}">
            <button class="action-btn danger" type="submit">Revoke</button>
          </form>
        </td>
      </tr>`
    )
    .join('\n');

  return `
    <div class="sentinel-banner" style="margin-bottom: 16px; border-color: #3fb950; background: rgba(63, 185, 80, 0.12); color: #7ee787;">
      <div><strong>🛡️ Admin Access:</strong> You have elevated privileges — this screen is restricted to the <code>admin</code> role.</div>
    </div>

    <div class="widget-grid" style="margin-bottom: 16px; grid-template-columns: repeat(4, 1fr);">
      <div class="card"><div class="card-header"><div class="card-title-group"><span class="card-icon">👥</span><span class="card-title">Total Users</span></div></div><div class="card-stat">${data.totalUsers}</div></div>
      <div class="card"><div class="card-header"><div class="card-title-group"><span class="card-icon">🛡️</span><span class="card-title">Administrators</span></div></div><div class="card-stat">${data.adminCount}</div></div>
      <div class="card"><div class="card-header"><div class="card-title-group"><span class="card-icon">🧑‍💻</span><span class="card-title">Developers</span></div></div><div class="card-stat">${data.developerCount}</div></div>
      <div class="card"><div class="card-header"><div class="card-title-group"><span class="card-icon">🔐</span><span class="card-title">Hash Engine</span></div></div><div class="card-subtitle" style="margin:0; font-size:13px; color: var(--text-white);">argon2id (legacy SHA-256 rows upgraded on login)</div></div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">📋</span><span class="card-title">Operator Registry</span></div></div>
      <table class="worker-table">
        <thead><tr><th>User ID</th><th>Username</th><th>Role</th><th>Name</th><th>Email</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">➕</span><span class="card-title">Add New Operator</span></div></div>
      <form method="POST" action="/users">
        <div class="settings-row"><div><div class="settings-label">Username</div></div><input class="settings-input" name="username" required></div>
        <div class="settings-row"><div><div class="settings-label">Temporary Password</div></div><input class="settings-input" name="password" type="password" required></div>
        <div class="settings-row"><div><div class="settings-label">Role</div></div>
          <select class="assign-select" name="role">
            <option value="developer">developer</option>
            <option value="admin">admin</option>
            <option value="analyst">analyst</option>
            <option value="lead">lead</option>
          </select>
        </div>
        <div class="settings-row"><div><div class="settings-label">Full Name</div></div><input class="settings-input" name="name"></div>
        <div class="settings-row"><div><div class="settings-label">Email</div></div><input class="settings-input" name="email" type="email"></div>
        <button class="action-btn primary" type="submit" style="margin-top: 10px;">Create Operator</button>
      </form>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header"><div class="card-title-group"><span class="card-icon">🔑</span><span class="card-title">Active Sessions</span></div></div>
      ${data.sessions.length === 0
        ? `<div class="empty-state">No active sessions.</div>`
        : `<table class="worker-table">
            <thead><tr><th>Token</th><th>User</th><th>Created</th><th>Expires</th><th></th></tr></thead>
            <tbody>${sessionRows}</tbody>
          </table>`}
      <div class="card-footer"><span>Flags: <code>HttpOnly; SameSite=Lax</code>, 24h expiry</span></div>
    </div>

    <details class="card">
      <summary style="cursor:pointer;"><div class="card-title-group"><span class="card-icon">🗄️</span><span class="card-title">Raw SQL Seed &amp; Migration Explorer</span></div></summary>
      <div style="margin-top: 10px;">
        <div class="settings-label" style="margin-bottom: 6px;">src/data-access/sql/users.sql</div>
        <div class="log-block" style="white-space: pre-wrap; margin-bottom: 12px;">${escapeHtml(data.schemaSql)}</div>
        <div class="settings-label" style="margin-bottom: 6px;">src/data-access/sql/user_insert.sql</div>
        <div class="log-block" style="white-space: pre-wrap;">${escapeHtml(data.seedSql)}</div>
      </div>
    </details>
  `;
}
