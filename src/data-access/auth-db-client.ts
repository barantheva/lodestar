import { Database } from 'bun:sqlite';
import { createHash, timingSafeEqual } from 'crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as nodePath from 'node:path';

const SQL_DIR = nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), 'sql');

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  role: string;
  name: string | null;
  email: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

// argon2id PHC string embeds its own salt, so the salt column stays '' for new hashes.
export function hashPassword(password: string): { hash: string; salt: string } {
  return { hash: Bun.password.hashSync(password, 'argon2id'), salt: '' };
}

export function isLegacyHash(hash: string): boolean {
  return !hash.startsWith('$argon2');
}

// Legacy rows (seed SQL, pre-argon2 users) are salted SHA-256; AuthService rehashes them on next login.
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!isLegacyHash(hash)) return Bun.password.verifySync(password, hash);
  const computed = createHash('sha256').update(password + salt).digest();
  const stored = Buffer.from(hash, 'hex');
  return stored.length === computed.length && timingSafeEqual(stored, computed);
}

export class AuthDb {
  constructor(private db: Database, schemaSql: string, seedSql: string) {
    this.runSqlScript(schemaSql);
    this.runSqlScript(seedSql);
  }

  private runSqlScript(sqlContent: string): void {
    const cleanSql = sqlContent.replace(/--.*$/gm, '').trim();
    const statements = cleanSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      this.db.run(stmt);
    }
  }

  executeSql(sql: string): void {
    this.db.run(sql);
  }

  loadUserInsertSql(sqlContent: string): void {
    this.runSqlScript(sqlContent);
  }

  insertUser(user: UserRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, role, name, email, created_at, updated_at)
      VALUES ($id, $username, $password_hash, $salt, $role, $name, $email, $created_at, $updated_at)
    `);
    stmt.run({
      $id: user.id,
      $username: user.username,
      $password_hash: user.password_hash,
      $salt: user.salt,
      $role: user.role,
      $name: user.name,
      $email: user.email,
      $created_at: user.created_at,
      $updated_at: user.updated_at,
    });
  }

  findUserByUsername(username: string): UserRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM users WHERE username = $username`);
    const row = stmt.get({ $username: username }) as UserRecord | null;
    return row || null;
  }

  findUserById(id: string): UserRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM users WHERE id = $id`);
    const row = stmt.get({ $id: id }) as UserRecord | null;
    return row || null;
  }

  updatePassword(id: string, passwordHash: string, salt: string): void {
    this.db
      .prepare(`UPDATE users SET password_hash = $hash, salt = $salt, updated_at = $now WHERE id = $id`)
      .run({ $hash: passwordHash, $salt: salt, $now: Date.now(), $id: id });
  }

  listUsers(): UserRecord[] {
    return this.db.prepare(`SELECT * FROM users ORDER BY username ASC`).all() as UserRecord[];
  }

  insertSession(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES ($token, $user_id, $expires_at, $created_at)
    `);
    stmt.run({
      $token: session.token,
      $user_id: session.user_id,
      $expires_at: session.expires_at,
      $created_at: session.created_at,
    });
  }

  listSessions(): SessionRecord[] {
    return this.db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as SessionRecord[];
  }

  findSession(token: string): SessionRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE token = $token`);
    const row = stmt.get({ $token: token }) as SessionRecord | null;
    return row || null;
  }

  deleteSession(token: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE token = $token`).run({ $token: token });
  }

  deleteExpiredSessions(now: number = Date.now()): void {
    this.db.prepare(`DELETE FROM sessions WHERE expires_at <= $now`).run({ $now: now });
  }
}

export function openAuthDb(dbPath: string = ':memory:'): AuthDb {
  const db = new Database(dbPath);
  const schemaSql = readFileSync(nodePath.join(SQL_DIR, 'users.sql'), 'utf-8');
  const seedSql = readFileSync(nodePath.join(SQL_DIR, 'user_insert.sql'), 'utf-8');
  return new AuthDb(db, schemaSql, seedSql);
}
