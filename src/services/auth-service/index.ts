import { randomUUID, randomBytes } from 'crypto';
import type { AuthDb, UserRecord } from '../../data-access/auth-db-client.ts';
import { hashPassword, isLegacyHash, verifyPassword } from '../../data-access/auth-db-client.ts';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  name: string | null;
  email: string | null;
}

export interface SessionSummary {
  token: string;
  username: string;
  expiresAt: number;
  createdAt: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: string;
  name?: string;
  email?: string;
}

export class AuthService {
  constructor(private authDb: AuthDb, private sessionTtlMs: number = 24 * 60 * 60 * 1000) {}

  authenticate(username: string, password: string): { user: AuthUser; sessionToken: string } | null {
    const user = this.authDb.findUserByUsername(username.trim());
    if (!user) return null;

    if (!verifyPassword(password, user.password_hash, user.salt)) {
      return null;
    }
    if (isLegacyHash(user.password_hash)) {
      const { hash, salt } = hashPassword(password);
      this.authDb.updatePassword(user.id, hash, salt);
    }

    const sessionToken = randomBytes(32).toString('hex');
    const now = Date.now();
    this.authDb.insertSession({
      token: sessionToken,
      user_id: user.id,
      expires_at: now + this.sessionTtlMs,
      created_at: now,
    });

    return {
      user: this.toAuthUser(user),
      sessionToken,
    };
  }

  validateSession(token: string): AuthUser | null {
    if (!token) return null;
    const now = Date.now();
    this.authDb.deleteExpiredSessions(now);

    const session = this.authDb.findSession(token);
    if (!session || session.expires_at <= now) {
      return null;
    }

    const user = this.authDb.findUserById(session.user_id);
    if (!user) return null;

    return this.toAuthUser(user);
  }

  logout(token: string): void {
    if (token) {
      this.authDb.deleteSession(token);
    }
  }

  createUser(input: CreateUserInput): AuthUser {
    const existing = this.authDb.findUserByUsername(input.username.trim());
    if (existing) {
      throw new Error(`User with username '${input.username}' already exists`);
    }

    const { hash, salt } = hashPassword(input.password);
    const now = Date.now();
    const id = `usr_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const record: UserRecord = {
      id,
      username: input.username.trim(),
      password_hash: hash,
      salt,
      role: input.role || 'user',
      name: input.name || null,
      email: input.email || null,
      created_at: now,
      updated_at: now,
    };

    this.authDb.insertUser(record);
    return this.toAuthUser(record);
  }

  setPassword(username: string, password: string): void {
    const user = this.authDb.findUserByUsername(username);
    if (!user) throw new Error(`No user '${username}'`);
    const { hash, salt } = hashPassword(password);
    this.authDb.updatePassword(user.id, hash, salt);
  }

  // The seed SQL ships admin/admin and developer/developer; flag any account still matching that pattern.
  accountsWithDefaultPasswords(): string[] {
    return this.authDb
      .listUsers()
      .filter(u => verifyPassword(u.username, u.password_hash, u.salt))
      .map(u => u.username);
  }

  listUsers(): AuthUser[] {
    return this.authDb.listUsers().map(u => this.toAuthUser(u));
  }

  listSessions(): SessionSummary[] {
    return this.authDb.listSessions().map(s => {
      const user = this.authDb.findUserById(s.user_id);
      return {
        token: s.token,
        username: user?.username || s.user_id,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
      };
    });
  }

  revokeSession(token: string): void {
    this.authDb.deleteSession(token);
  }

  private toAuthUser(record: UserRecord): AuthUser {
    return {
      id: record.id,
      username: record.username,
      role: record.role,
      name: record.name,
      email: record.email,
    };
  }
}
