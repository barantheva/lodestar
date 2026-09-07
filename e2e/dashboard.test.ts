import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createDashboardServer } from '../src/dashboard/server.ts';
import { loadConfig } from '../src/config/index.ts';
import { EventBus } from '../src/core/event-bus.ts';
import { ServiceRegistry } from '../src/core/registry.ts';
import { FleetDb } from '../src/services/agent-service/fleet-db.ts';
import { GitTool } from '../src/plugins/tools/git-tool.ts';
import { NAV_ITEMS } from '../src/shared/ui/layout.ts';
import { PlanningService, type TaskContext } from '../src/services/planning-service/index.ts';

describe('Dashboard E2E — real server, every screen, real data', () => {
  const baseDir = path.join(process.cwd(), '.e2e-dashboard-' + Date.now());
  let server: ReturnType<typeof createDashboardServer>;
  let baseUrl: string;
  let sessionCookie: string;

  beforeAll(async () => {
    await fs.mkdir(baseDir, { recursive: true });

    const service = new PlanningService();
    const ctx: TaskContext = {
      trackId: 'e2e-track-1',
      repo: 'owner/repo',
      issueNumber: 1,
      issueTitle: 'E2E fixture track',
      issueBody: 'seeded by the dashboard e2e test',
      baseDir,
    };
    await service.generateIntent(ctx, 'B', 'analyst-e2e');
    await service.generatePlan(ctx, 'engineer-e2e');
    await service.generateEvidence(ctx, 'all tests passed', 'lead-e2e', { verdict: 'PASS', reasons: 'clean' });

    const config = loadConfig({ GITHUB_TOKEN: 'e2e-token', GITHUB_REPO: 'owner/repo', PORT: '0' });
    const registry = new ServiceRegistry();
    registry.registerTool(new GitTool());
    const eventBus = new EventBus();
    const fleetDb = new FleetDb(':memory:');
    fleetDb.upsertWorker({ name: 'e2e-agent-1', job: 'issue-monitor', provider: 'claude', state: 'idle' });

    server = createDashboardServer({ registry, eventBus, fleetDb, config, baseDir });
    baseUrl = `http://localhost:${server.port}`;

    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'admin' }),
      redirect: 'manual',
    });
    expect(loginRes.status).toBe(302);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    sessionCookie = setCookie.split(';')[0];
    expect(sessionCookie).toContain('session=');
  });

  afterAll(async () => {
    server.stop(true);
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('redirects an unauthenticated request to /login', async () => {
    const res = await fetch(`${baseUrl}/stats`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  for (const item of NAV_ITEMS) {
    it(`renders /${item.route.replace(/^\//, '')} (${item.label}) with the real shared layout, no placeholder`, async () => {
      const res = await fetch(`${baseUrl}${item.route}`, { headers: { cookie: sessionCookie } });
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain(`class="nav-item active" href="${item.route}"`);
      expect(html).not.toContain("isn't wired to the dashboard server yet");
    });
  }

  it('shows the real seeded track on the Memories Guard Document Browser', async () => {
    const res = await fetch(`${baseUrl}/memories`, { headers: { cookie: sessionCookie } });
    const html = await res.text();
    expect(html).toContain('e2e-track-1');
    expect(html).toContain('analyst-e2e');
    expect(html).toContain('lead-e2e');
  });

  it('renders user popover dropdown with Last Login and clean Active status without database reference', async () => {
    const res = await fetch(`${baseUrl}/stats`, { headers: { cookie: sessionCookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Last Login:');
    expect(html).toContain('● Active');
    expect(html).not.toContain('● Active (SQLite)');
  });

  it('rejects invalid credentials with 401 and an error message on GET/POST /login', async () => {
    const getRes = await fetch(`${baseUrl}/login`);
    expect(getRes.status).toBe(200);
    const getHtml = await getRes.text();
    expect(getHtml).toContain('Lodestar Operations');

    const badLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'wrong-password' }),
      redirect: 'manual',
    });
    expect(badLoginRes.status).toBe(401);
    const badHtml = await badLoginRes.text();
    expect(badHtml).toContain('Invalid username or password');
  });

  it('supports JSON login payload and respects returnUrl redirect', async () => {
    const jsonLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin', returnUrl: '/config' }),
      redirect: 'manual',
    });
    expect(jsonLoginRes.status).toBe(302);
    expect(jsonLoginRes.headers.get('location')).toBe('/config');
  });

  it('renders GET /release-new preview form with auto-generated tag draft', async () => {
    const releaseRes = await fetch(`${baseUrl}/release-new`, {
      headers: { cookie: sessionCookie },
    });
    expect(releaseRes.status).toBe(200);
    const html = await releaseRes.text();
    expect(html).toContain('Create Release');
    expect(html).toContain('tag');
  });

  it('logs out and revokes the session', async () => {
    const res = await fetch(`${baseUrl}/logout`, { headers: { cookie: sessionCookie }, redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');

    const afterLogout = await fetch(`${baseUrl}/stats`, { headers: { cookie: sessionCookie }, redirect: 'manual' });
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.get('location')).toContain('/login');
  });
});
