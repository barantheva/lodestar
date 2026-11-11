import { describe, it, expect } from 'bun:test';
import { openAuthDb } from '../../data-access/auth-db-client.ts';
import { AuthService } from './index.ts';

describe('AuthService', () => {
  it('authenticates default admin credentials successfully', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    const result = authService.authenticate('admin', 'admin');
    expect(result).not.toBeNull();
    expect(result?.user.username).toBe('admin');
    expect(result?.user.role).toBe('admin');
    expect(typeof result?.sessionToken).toBe('string');
  });

  it('rejects invalid password or non-existent username', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    expect(authService.authenticate('admin', 'wrong')).toBeNull();
    expect(authService.authenticate('nonexistent', 'admin')).toBeNull();
  });

  it('validates active session and rejects invalid or logged out session', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    const result = authService.authenticate('admin', 'admin')!;
    const user = authService.validateSession(result.sessionToken);
    expect(user).not.toBeNull();
    expect(user?.username).toBe('admin');

    authService.logout(result.sessionToken);
    expect(authService.validateSession(result.sessionToken)).toBeNull();
  });

  it('allows creating new users dynamically', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    const newUser = authService.createUser({
      username: 'analyst1',
      password: 'password123',
      role: 'analyst',
      name: 'Sarah Chen',
      email: 'sarah@lodestar.local',
    });

    expect(newUser.username).toBe('analyst1');
    expect(newUser.role).toBe('analyst');

    const authResult = authService.authenticate('analyst1', 'password123');
    expect(authResult).not.toBeNull();
    expect(authResult?.user.name).toBe('Sarah Chen');

    expect(() => authService.createUser({ username: 'analyst1', password: 'xyz' })).toThrow();
  });

  it('hashes new users with argon2id and upgrades legacy seed hashes on login', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    authService.createUser({ username: 'ops', password: 'pw' });
    expect(authDb.findUserByUsername('ops')!.password_hash.startsWith('$argon2id$')).toBe(true);

    expect(authDb.findUserByUsername('admin')!.password_hash.startsWith('$argon2')).toBe(false);
    expect(authService.authenticate('admin', 'admin')).not.toBeNull();
    expect(authDb.findUserByUsername('admin')!.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(authService.authenticate('admin', 'admin')).not.toBeNull();
  });

  it('flags default-password accounts until the admin password is overridden', () => {
    const authService = new AuthService(openAuthDb(':memory:'));
    expect(authService.accountsWithDefaultPasswords().sort()).toEqual(['admin', 'developer']);

    authService.setPassword('admin', 'a-real-secret');
    expect(authService.accountsWithDefaultPasswords()).toEqual(['developer']);
    expect(authService.authenticate('admin', 'admin')).toBeNull();
    expect(authService.authenticate('admin', 'a-real-secret')).not.toBeNull();
    expect(() => authService.setPassword('ghost', 'x')).toThrow();
  });

  it('lists active sessions joined with the owning username, and revokes by token', () => {
    const authDb = openAuthDb(':memory:');
    const authService = new AuthService(authDb);

    const { sessionToken } = authService.authenticate('admin', 'admin')!;

    const sessions = authService.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].username).toBe('admin');
    expect(sessions[0].token).toBe(sessionToken);

    authService.revokeSession(sessionToken);
    expect(authService.listSessions()).toHaveLength(0);
    expect(authService.validateSession(sessionToken)).toBeNull();
  });
});
