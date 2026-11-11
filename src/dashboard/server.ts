import { renderLayout, NAV_ITEMS } from '../shared/ui/layout.ts';
import { escapeHtml } from '../shared/utils/escape-html.ts';
import type { DashboardDeps } from './dashboard-deps.ts';
import { getOrgStats } from './features/stats/use-cases/get-org-stats.ts';
import { renderStatsPage } from './features/stats/ui/stats-page.ts';
import { getAmpStatus } from './features/amp/use-cases/get-amp-status.ts';
import { renderAmpPage } from './features/amp/ui/amp-page.ts';
import { getReleases } from './features/releases/use-cases/get-releases.ts';
import { renderReleasesPage } from './features/releases/ui/releases-page.ts';
import { getCreateReleasePreview } from './features/releasenew/use-cases/get-create-release-preview.ts';
import { createRelease } from './features/releasenew/use-cases/create-release.ts';
import { renderCreateReleasePage } from './features/releasenew/ui/releasenew-page.ts';
import { getRepoStats } from './features/reposstats/use-cases/get-repo-stats.ts';
import { renderRepoStatsPage } from './features/reposstats/ui/reposstats-page.ts';
import { getRelayStatus } from './features/relay/use-cases/get-relay-status.ts';
import { renderRelayPage } from './features/relay/ui/relay-page.ts';
import { getFleetStatus } from './features/fleet/use-cases/get-fleet-status.ts';
import { renderFleetPage } from './features/fleet/ui/fleet-page.ts';
import { getKnowledgeSnapshot } from './features/knowledge/use-cases/get-knowledge-snapshot.ts';
import { renderKnowledgePage } from './features/knowledge/ui/knowledge-page.ts';
import { getMemories } from './features/memories/use-cases/get-memories.ts';
import { renderMemoriesPage } from './features/memories/ui/memories-page.ts';
import { getRunHistory } from './features/history/use-cases/get-run-history.ts';
import { renderHistoryPage } from './features/history/ui/history-page.ts';
import { getAgentsLog } from './features/agentslog/use-cases/get-agents-log.ts';
import { renderAgentsLogPage } from './features/agentslog/ui/agentslog-page.ts';
import { getSetupStatus } from './features/setup/use-cases/get-setup-status.ts';
import { renderSetupPage } from './features/setup/ui/setup-page.ts';
import { getConfigView } from './features/config/use-cases/get-config-view.ts';
import { renderConfigPage } from './features/config/ui/config-page.ts';
import { getMonitorSetup } from './features/monitorsetup/use-cases/get-monitor-setup.ts';
import { renderMonitorSetupPage } from './features/monitorsetup/ui/monitorsetup-page.ts';
import { getUsersRegistry } from './features/users/use-cases/get-users-registry.ts';
import { renderUsersPage } from './features/users/ui/users-page.ts';
import { createOperator } from './features/users/use-cases/create-operator.ts';
import { AuthService } from '../services/auth-service/index.ts';
import { openAuthDb } from '../data-access/auth-db-client.ts';
import { renderLoginPage } from './features/auth/ui/login-page.ts';
import { validateUserSession } from './features/auth/use-cases/validate-user-session.ts';
import { loginUser } from './features/auth/use-cases/login-user.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function notBuiltPage(screen: string): string {
  return `<div class="card"><div class="empty-state">Screen "${screen}" isn't wired to the dashboard server yet.</div></div>`;
}

export function createDashboardServer(deps: DashboardDeps) {
  const authService = deps.authService || new AuthService(openAuthDb());

  return Bun.serve({
    port: deps.config.port,
    hostname: deps.hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // Loopback bind alone doesn't stop DNS rebinding: a rebound attacker domain still reaches 127.0.0.1.
      if (deps.hostname === '127.0.0.1' && !LOOPBACK_HOSTS.has(url.hostname)) {
        return new Response('Misdirected Request', { status: 421 });
      }

      // Public /login endpoint
      if (url.pathname === '/login') {
        if (req.method === 'GET') {
          const error = url.searchParams.get('error') || undefined;
          const returnUrl = url.searchParams.get('returnUrl') || '/stats';
          return new Response(renderLoginPage({ error, returnUrl }), {
            headers: { 'content-type': 'text/html' },
          });
        }

        if (req.method === 'POST') {
          let username = '';
          let password = '';
          let returnUrl = '/stats';

          const contentType = req.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = (await req.json()) as { username?: string; password?: string; returnUrl?: string };
            username = body.username || '';
            password = body.password || '';
            returnUrl = body.returnUrl || '/stats';
          } else {
            const formData = await req.formData();
            username = (formData.get('username') as string) || '';
            password = (formData.get('password') as string) || '';
            returnUrl = (formData.get('returnUrl') as string) || '/stats';
          }

          const loginResult = loginUser(authService, { username, password });
          if (!loginResult.success || !loginResult.sessionToken) {
            return new Response(
              renderLoginPage({ error: loginResult.error || 'Invalid username or password', returnUrl }),
              {
                status: 401,
                headers: { 'content-type': 'text/html' },
              }
            );
          }

          const cookie = `session=${loginResult.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
          return new Response(null, {
            status: 302,
            headers: {
              Location: returnUrl.startsWith('/') ? returnUrl : '/stats',
              'Set-Cookie': cookie,
            },
          });
        }
      }

      // Public /logout endpoint
      if (url.pathname === '/logout') {
        const cookieHeader = req.headers.get('cookie');
        const tokenMatch = cookieHeader?.match(/(?:^|;\s*)session=([^;]*)/);
        if (tokenMatch) {
          authService.logout(decodeURIComponent(tokenMatch[1]));
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: '/login',
            'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          },
        });
      }

      // Session authentication for dashboard routes
      const user = validateUserSession(authService, req.headers.get('cookie'));
      if (!user) {
        const loginRedirect = `/login?returnUrl=${encodeURIComponent(url.pathname)}`;
        return new Response(null, {
          status: 302,
          headers: { Location: loginRedirect },
        });
      }

      if (url.pathname === '/stats' || url.pathname === '/') {
        const stats = await getOrgStats({ baseDir: deps.baseDir, fleetDb: deps.fleetDb });
        const html = renderLayout({ activeScreen: 'stats', title: 'My stats', bodyHtml: renderStatsPage(stats), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/amp') {
        const amp = getAmpStatus({ config: deps.config });
        const html = renderLayout({ activeScreen: 'amp', title: 'AMP mesh', bodyHtml: renderAmpPage(amp), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/releases') {
        const releases = await getReleases({ registry: deps.registry, baseDir: deps.baseDir });
        const html = renderLayout({ activeScreen: 'releases', title: 'Release Tracker', bodyHtml: renderReleasesPage(releases), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/release-new') {
        if (req.method === 'POST') {
          // Tag/filename/changelog are recomputed here, never trusted from the client — the
          // GET preview's hidden fields could otherwise be edited into a shell-injection or
          // path-traversal payload via devtools before submit.
          const preview = await getCreateReleasePreview({ registry: deps.registry, baseDir: deps.baseDir });

          const result = await createRelease(
            { registry: deps.registry, baseDir: deps.baseDir },
            { tag: preview.tag, changelogFilename: preview.changelogFilename, changelogContent: preview.changelogDraft }
          );
          if (!result.success) {
            const html = renderLayout({
              activeScreen: 'releasenew',
              title: 'Create Release',
              bodyHtml: `<div class="card"><div class="empty-state">Release failed: ${escapeHtml(result.error || 'unknown error')}</div></div>${renderCreateReleasePage(preview)}`,
              user,
            });
            return new Response(html, { status: 500, headers: { 'content-type': 'text/html' } });
          }

          return new Response(null, { status: 302, headers: { Location: '/releases' } });
        }

        const preview = await getCreateReleasePreview({ registry: deps.registry, baseDir: deps.baseDir });
        const html = renderLayout({ activeScreen: 'releasenew', title: 'Create Release', bodyHtml: renderCreateReleasePage(preview), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/repos') {
        const repoStats = await getRepoStats({ baseDir: deps.baseDir, config: deps.config });
        const html = renderLayout({ activeScreen: 'reposstats', title: 'Repos stats', bodyHtml: renderRepoStatsPage(repoStats), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/relay') {
        const relay = await getRelayStatus({ baseDir: deps.baseDir });
        const html = renderLayout({ activeScreen: 'relay', title: 'Relay Pipeline', bodyHtml: renderRelayPage(relay), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/fleet') {
        const fleet = getFleetStatus({ fleetDb: deps.fleetDb });
        const html = renderLayout({ activeScreen: 'fleet', title: 'My fleet', bodyHtml: renderFleetPage(fleet), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/knowledge') {
        const knowledge = await getKnowledgeSnapshot({ config: deps.config, memoryBackend: deps.memoryBackend });
        const html = renderLayout({ activeScreen: 'knowledge', title: 'Knowledge', bodyHtml: renderKnowledgePage(knowledge), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/memories') {
        const memories = await getMemories({ baseDir: deps.baseDir });
        const html = renderLayout({ activeScreen: 'memories', title: 'Memories', bodyHtml: renderMemoriesPage(memories), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/history') {
        const history = await getRunHistory({ baseDir: deps.baseDir });
        const html = renderLayout({ activeScreen: 'history', title: 'History', bodyHtml: renderHistoryPage(history), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/agents-log') {
        const agentsLog = await getAgentsLog({ fleetDb: deps.fleetDb, memoryBackend: deps.memoryBackend });
        const html = renderLayout({ activeScreen: 'agentslog', title: 'Agents Log', bodyHtml: renderAgentsLogPage(agentsLog), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/setup') {
        const setup = await getSetupStatus(deps.baseDir);
        const html = renderLayout({ activeScreen: 'skillsetup', title: 'Skill Setup', bodyHtml: renderSetupPage(setup), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/monitorsetup') {
        const monitorSetup = getMonitorSetup({ config: deps.config });
        const html = renderLayout({ activeScreen: 'monitorsetup', title: 'Monitor Setup', bodyHtml: renderMonitorSetupPage(monitorSetup), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/config') {
        const configView = getConfigView({ config: deps.config });
        const html = renderLayout({ activeScreen: 'config', title: 'Configuration', bodyHtml: renderConfigPage(configView), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/users' || url.pathname === '/users/revoke-session') {
        if (user.role !== 'admin') {
          return new Response('Forbidden — admin role required', { status: 403 });
        }
      }

      if (url.pathname === '/users') {
        if (req.method === 'POST') {
          const formData = await req.formData();
          const username = (formData.get('username') as string) || '';
          const password = (formData.get('password') as string) || '';
          const role = (formData.get('role') as string) || 'developer';
          const name = (formData.get('name') as string) || undefined;
          const email = (formData.get('email') as string) || undefined;

          createOperator(authService, { username, password, role, name, email });
          return new Response(null, { status: 302, headers: { Location: '/users' } });
        }

        const data = await getUsersRegistry(authService);
        const html = renderLayout({ activeScreen: 'users', title: 'Users Registry', bodyHtml: renderUsersPage(data), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      if (url.pathname === '/users/revoke-session' && req.method === 'POST') {
        const formData = await req.formData();
        const token = (formData.get('token') as string) || '';
        if (token) authService.revokeSession(token);
        return new Response(null, { status: 302, headers: { Location: '/users' } });
      }

      const navItem = NAV_ITEMS.find(i => i.route === url.pathname);
      if (navItem) {
        const html = renderLayout({ activeScreen: navItem.screen, title: navItem.label, bodyHtml: notBuiltPage(navItem.screen), user });
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      }

      return new Response('Not found', { status: 404 });
    },
  });
}

