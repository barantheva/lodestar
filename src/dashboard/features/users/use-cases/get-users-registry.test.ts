import { describe, expect, it } from 'bun:test';
import { getUsersRegistry } from './get-users-registry.ts';
import { openAuthDb } from '../../../../data-access/auth-db-client.ts';
import { AuthService } from '../../../../services/auth-service/index.ts';

describe('getUsersRegistry', () => {
  it('lists real seeded users, real active sessions, and real role counts', async () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);
    authService.authenticate('admin', 'admin');

    const registry = await getUsersRegistry(authService);

    expect(registry.totalUsers).toBe(2);
    expect(registry.adminCount).toBe(1);
    expect(registry.developerCount).toBe(1);
    expect(registry.users.map(u => u.username).sort()).toEqual(['admin', 'developer']);
    expect(registry.sessions).toHaveLength(1);
    expect(registry.sessions[0].username).toBe('admin');
  });

  it('reflects a newly created operator immediately', async () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);
    authService.createUser({ username: 'analyst1', password: 'pw', role: 'analyst' });

    const registry = await getUsersRegistry(authService);

    expect(registry.totalUsers).toBe(3);
    expect(registry.users.some(u => u.username === 'analyst1')).toBe(true);
  });

  it('includes the real schema and seed SQL file contents for the migration explorer', async () => {
    const authService = new AuthService(openAuthDb(':memory:'));
    const registry = await getUsersRegistry(authService);

    expect(registry.schemaSql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(registry.seedSql).toContain('admin');
  });
});
