import { describe, it, expect } from 'bun:test';
import { createDashboardServer } from './server.ts';
import { openFleetDb } from '../data-access/fleet-db-client.ts';
import { openAuthDb } from '../data-access/auth-db-client.ts';
import { AuthService } from '../services/auth-service/index.ts';
import { FleetDb } from '../services/agent-service/fleet-db.ts';
import { ServiceRegistry } from '../core/registry.ts';
import { EventBus } from '../core/event-bus.ts';
import { loadConfig } from '../config/index.ts';

function createTestDeps() {
  const authDb = openAuthDb(':memory:');
  const authService = new AuthService(authDb);
  const fleetDb = new FleetDb(':memory:');
  const registry = new ServiceRegistry();
  const eventBus = new EventBus();

  const config = loadConfig({
    GITHUB_TOKEN: 'ghp_test',
    GITHUB_REPO: 'test/repo',
    PORT: '0',
    AGENT_COUNT: '0',
  });

  return {
    registry,
    eventBus,
    fleetDb,
    authService,
    config,
  };
}

describe('Dashboard Server Authentication', () => {
  it('serves GET /login with login form', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const res = await server.fetch(new Request('http://localhost/login'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Sign in to Lodestar');
    expect(html).toContain('Quick-fill admin');
    expect(html).toContain('Quick-fill developer');
    expect(html).toContain('admin');
    server.stop();
  });

  it('rejects POST /login with invalid credentials with 401', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const formData = new FormData();
    formData.append('username', 'admin');
    formData.append('password', 'wrongpassword');

    const res = await server.fetch(new Request('http://localhost/login', {
      method: 'POST',
      body: formData,
    }));

    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('Invalid username or password');
    server.stop();
  });

  it('authenticates POST /login with admin/admin and sets session cookie', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const formData = new FormData();
    formData.append('username', 'admin');
    formData.append('password', 'admin');

    const res = await server.fetch(new Request('http://localhost/login', {
      method: 'POST',
      body: formData,
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/stats');
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).not.toBeNull();
    expect(cookie).toContain('session=');
    server.stop();
  });

  it('redirects unauthenticated requests to /login', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const res = await server.fetch(new Request('http://localhost/stats'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/login');
    server.stop();
  });

  it('allows authenticated requests with session cookie and shows user in topbar', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const authResult = deps.authService.authenticate('admin', 'admin')!;
    const cookie = `session=${authResult.sessionToken}`;

    const res = await server.fetch(new Request('http://localhost/stats', {
      headers: { cookie },
    }));

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('My stats');
    expect(html).toContain('admin');
    expect(html).toContain('Sign out');
    server.stop();
  });

  it('handles /logout by clearing session cookie and redirecting to /login', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const authResult = deps.authService.authenticate('admin', 'admin')!;
    const cookie = `session=${authResult.sessionToken}`;

    const res = await server.fetch(new Request('http://localhost/logout', {
      headers: { cookie },
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/login');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');

    expect(deps.authService.validateSession(authResult.sessionToken)).toBeNull();
    server.stop();
  });

  it('blocks /users for a non-admin developer session (screen-list.md §9d RBAC)', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const authResult = deps.authService.authenticate('developer', 'developer')!;
    const cookie = `session=${authResult.sessionToken}`;

    const res = await server.fetch(new Request('http://localhost/users', { headers: { cookie } }));

    expect(res.status).toBe(403);
    server.stop();
  });

  it('allows /users for an admin session', async () => {
    const deps = createTestDeps();
    const server = createDashboardServer(deps);

    const authResult = deps.authService.authenticate('admin', 'admin')!;
    const cookie = `session=${authResult.sessionToken}`;

    const res = await server.fetch(new Request('http://localhost/users', { headers: { cookie } }));

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Operator Registry');
    server.stop();
  });
});
