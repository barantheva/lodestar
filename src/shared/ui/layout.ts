import { DASHBOARD_CSS } from './styles.ts';

export interface NavItem {
  screen: string;
  route: string;
  icon: string;
  label: string;
  group: string;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { screen: 'stats', route: '/stats', icon: '📊', label: 'My stats', group: 'Dashboards' },
  { screen: 'reposstats', route: '/repos', icon: '📁', label: 'Repos stats', group: 'Dashboards' },
  { screen: 'relay', route: '/relay', icon: '🚦', label: 'Relay Pipeline', group: 'Dashboards' },
  { screen: 'fleet', route: '/fleet', icon: '🤖', label: 'My fleet', group: 'Dashboards' },
  { screen: 'amp', route: '/amp', icon: '🕸️', label: 'AMP mesh', group: 'Dashboards' },
  { screen: 'knowledge', route: '/knowledge', icon: '📚', label: 'Knowledge', group: 'Intelligence' },
  { screen: 'memories', route: '/memories', icon: '🧠', label: 'Memories', group: 'Intelligence' },
  { screen: 'history', route: '/history', icon: '📜', label: 'History', group: 'Outcomes' },
  { screen: 'releases', route: '/releases', icon: '🏷️', label: 'Releases', group: 'Outcomes' },
  { screen: 'releasenew', route: '/release-new', icon: '🚀', label: 'New Release', group: 'Outcomes' },
  { screen: 'agentslog', route: '/agents-log', icon: '🗒️', label: 'Agents Log', group: 'Outcomes' },
  { screen: 'skillsetup', route: '/setup', icon: '⚙️', label: 'Skill Setup', group: 'Setup' },
  { screen: 'monitorsetup', route: '/monitorsetup', icon: '📡', label: 'Monitor Setup', group: 'Setup' },
  { screen: 'config', route: '/config', icon: '🔧', label: 'Configuration', group: 'Setup' },
  { screen: 'users', route: '/users', icon: '👥', label: 'Users Registry', group: 'Setup', adminOnly: true },
];

const BRAND_MARK = `<svg viewBox="0 0 512 512" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(256, 256)">
    <circle r="160" stroke="#38bdf8" stroke-width="8" stroke-opacity="0.2" stroke-dasharray="16 16"/>
    <circle r="95" stroke="#818cf8" stroke-width="8" stroke-opacity="0.3"/>
    <path d="M 0,-210 L 38,0 L 0,0 Z" fill="#38bdf8"/>
    <path d="M 0,-210 L -38,0 L 0,0 Z" fill="#0284c7"/>
    <path d="M 0,210 L 38,0 L 0,0 Z" fill="#818cf8"/>
    <path d="M 0,210 L -38,0 L 0,0 Z" fill="#4f46e5"/>
    <path d="M 210,0 L 0,38 L 0,0 Z" fill="#38bdf8"/>
    <path d="M 210,0 L 0,-38 L 0,0 Z" fill="#0284c7"/>
    <path d="M -210,0 L 0,38 L 0,0 Z" fill="#818cf8"/>
    <path d="M -210,0 L 0,-38 L 0,0 Z" fill="#4f46e5"/>
    <circle r="18" fill="#ffffff"/>
  </g>
</svg>`;

function renderNav(activeScreen: string, badges: Partial<Record<string, number>>, isAdmin: boolean): string {
  const visibleItems = NAV_ITEMS.filter(i => !i.adminOnly || isAdmin);
  const groups = [...new Set(visibleItems.map(i => i.group))];
  return groups
    .map(group => {
      const items = visibleItems.filter(i => i.group === group)
        .map(item => {
          const badge = badges[item.screen];
          return `<a class="nav-item${item.screen === activeScreen ? ' active' : ''}" href="${item.route}">${item.icon} ${item.label}${badge ? ` <span class="nav-badge">${badge}</span>` : ''}</a>`;
        })
        .join('\n');
      return `<div class="nav-group"><div class="nav-title">${group}</div>${items}</div>`;
    })
    .join('\n');
}

export interface LayoutOptions {
  activeScreen: string;
  title: string;
  bodyHtml: string;
  navBadges?: Partial<Record<string, number>>;
  user?: { username: string; role?: string };
}

export function renderLayout(opts: LayoutOptions): string {
  const role = opts.user?.role || 'user';
  const isAdmin = role === 'admin';
  const initial = (opts.user?.username || 'U').charAt(0).toUpperCase();

  const userHtml = opts.user
    ? `<div class="user-menu-wrapper" style="position: relative;">
        <button class="user-menu-btn" id="serverUserMenuBtn" type="button" onclick="const d=document.getElementById('serverUserPrompt');d.style.display=d.style.display==='none'?'block':'none';">
          <span>👤</span>
          <strong style="color: var(--text-white);">${opts.user.username}</strong>
          <span class="badge-pill ${isAdmin ? 'badge-green' : ''}" style="font-size: 10px;">${role}</span>
          <span style="font-size: 9px; color: var(--text-muted); margin-left: 2px;">▼</span>
        </button>

        <div class="user-prompt-dropdown" id="serverUserPrompt" style="display: none;">
          <div class="user-prompt-header">
            <div class="user-avatar-circle">${initial}</div>
            <div>
              <div style="font-weight: 700; color: var(--text-white); font-size: 13px;">${isAdmin ? 'Administrator' : 'Lodestar Developer'}</div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">@${opts.user.username}</div>
            </div>
            <span class="badge-pill ${isAdmin ? 'badge-green' : ''}" style="margin-left: auto;">${role}</span>
          </div>

          <div class="user-prompt-section">
            <div class="user-prompt-item">
              <span class="muted">Session:</span>
              <span class="ok" style="font-family: monospace; font-size: 11px;">● Active</span>
            </div>
            <div class="user-prompt-item">
              <span class="muted">Last Login:</span>
              <span style="font-family: monospace; font-size: 11px; color: var(--text-white);">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <div class="user-prompt-footer">
            <a href="/logout" class="action-btn danger" style="text-decoration: none; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600; padding: 7px 12px; box-sizing: border-box;">
              <span>🚪</span> <span>Sign out</span>
            </a>
          </div>
        </div>
      </div>
      <script>
        window.addEventListener('click', function(e) {
          const btn = document.getElementById('serverUserMenuBtn');
          const p = document.getElementById('serverUserPrompt');
          if (p && btn && !btn.contains(e.target) && !p.contains(e.target)) {
            p.style.display = 'none';
          }
        });
      </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title} — Lodestar</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <div class="app-body">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo" title="Lodestar">${BRAND_MARK}</div>
        <div class="brand-text"><h2>Lodestar</h2><span>repo &amp; fleet ops</span></div>
      </div>
      ${renderNav(opts.activeScreen, opts.navBadges || {}, isAdmin)}
      <div class="sidebar-footer"><span>v0.1.0</span></div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div class="topbar-left"><h1 class="page-title">${opts.title}</h1></div>
        ${userHtml}
      </header>
      <div class="dashboard-body">
        ${opts.bodyHtml}
      </div>
    </main>
  </div>
</body>
</html>`;
}
