import { describe, it, expect } from 'bun:test';
import { openAuthDb, hashPassword, verifyPassword } from './auth-db-client.ts';

describe('AuthDb', () => {
  it('seeds admin and developer users with default passwords automatically', () => {
    const authDb = openAuthDb(':memory:');

    const admin = authDb.findUserByUsername('admin');
    expect(admin).not.toBeNull();
    expect(admin?.username).toBe('admin');
    expect(admin?.role).toBe('admin');
    expect(verifyPassword('admin', admin!.password_hash, admin!.salt)).toBe(true);
    expect(verifyPassword('wrongpass', admin!.password_hash, admin!.salt)).toBe(false);

    const developer = authDb.findUserByUsername('developer');
    expect(developer).not.toBeNull();
    expect(developer?.username).toBe('developer');
    expect(developer?.role).toBe('developer');
    expect(verifyPassword('developer', developer!.password_hash, developer!.salt)).toBe(true);
    expect(verifyPassword('wrongpass', developer!.password_hash, developer!.salt)).toBe(false);
  });

  it('allows inserting and retrieving new users with separate SQL data', () => {
    const authDb = openAuthDb(':memory:');
    const { hash, salt } = hashPassword('secret123');
    const now = Date.now();

    authDb.insertUser({
      id: 'usr_guest_01',
      username: 'guest',
      password_hash: hash,
      salt,
      role: 'guest',
      name: 'Guest User',
      email: 'guest@lodestar.local',
      created_at: now,
      updated_at: now,
    });

    const user = authDb.findUserByUsername('guest');
    expect(user).not.toBeNull();
    expect(user?.name).toBe('Guest User');
    expect(user?.role).toBe('guest');
    expect(verifyPassword('secret123', user!.password_hash, user!.salt)).toBe(true);

    const userById = authDb.findUserById('usr_guest_01');
    expect(userById?.username).toBe('guest');

    const users = authDb.listUsers();
    expect(users.length).toBe(3); // admin, developer, guest
  });

  it('manages sessions and handles expiration', () => {
    const authDb = openAuthDb(':memory:');
    const now = Date.now();
    const token = 'sess_token_123';

    authDb.insertSession({
      token,
      user_id: 'usr_admin_default',
      expires_at: now + 3600_000,
      created_at: now,
    });

    const session = authDb.findSession(token);
    expect(session).not.toBeNull();
    expect(session?.user_id).toBe('usr_admin_default');

    authDb.deleteExpiredSessions(now + 4000_000);
    expect(authDb.findSession(token)).toBeNull();
  });

  it('lists active sessions and revokes them by token', () => {
    const authDb = openAuthDb(':memory:');
    const now = Date.now();
    authDb.insertSession({ token: 'sess_a', user_id: 'usr_admin_default', expires_at: now + 3600_000, created_at: now });
    authDb.insertSession({ token: 'sess_b', user_id: 'usr_developer_01', expires_at: now + 3600_000, created_at: now });

    expect(authDb.listSessions()).toHaveLength(2);

    authDb.deleteSession('sess_a');
    const remaining = authDb.listSessions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe('sess_b');
  });

  it('loads and initializes users from user_insert.sql script', async () => {
    const authDb = openAuthDb(':memory:');
    const sqlPath = new URL('./sql/user_insert.sql', import.meta.url).pathname;
    const sqlContent = await Bun.file(sqlPath).text();

    authDb.loadUserInsertSql(sqlContent);

    const admin = authDb.findUserByUsername('admin');
    expect(admin).not.toBeNull();
    expect(verifyPassword('admin', admin!.password_hash, admin!.salt)).toBe(true);

    const developer = authDb.findUserByUsername('developer');
    expect(developer).not.toBeNull();
    expect(developer?.name).toBe('Lodestar Developer');
    expect(developer?.role).toBe('developer');
    expect(verifyPassword('developer', developer!.password_hash, developer!.salt)).toBe(true);
  });

  it('seeds the default admin from the real sql/user_insert.sql file, not a runtime-regenerated hash', async () => {
    const sqlPath = new URL('./sql/user_insert.sql', import.meta.url).pathname;
    const sqlContent = await Bun.file(sqlPath).text();
    const fileHashMatch = sqlContent.match(/'usr_admin_default',\s*\n\s*'admin',\s*\n\s*'([0-9a-f]+)'/);
    expect(fileHashMatch).not.toBeNull();

    const authDb = openAuthDb(':memory:');
    const admin = authDb.findUserByUsername('admin');
    expect(admin?.password_hash).toBe(fileHashMatch![1]);
  });
});
