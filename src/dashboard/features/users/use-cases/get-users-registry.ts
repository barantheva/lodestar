import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthService, AuthUser, SessionSummary } from '../../../../services/auth-service/index.ts';

export interface UsersRegistryData {
  users: AuthUser[];
  sessions: SessionSummary[];
  totalUsers: number;
  adminCount: number;
  developerCount: number;
  schemaSql: string;
  seedSql: string;
}

const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'data-access', 'sql');

export async function getUsersRegistry(authService: AuthService): Promise<UsersRegistryData> {
  const users = authService.listUsers();

  const [schemaSql, seedSql] = await Promise.all([
    fs.readFile(path.join(SQL_DIR, 'users.sql'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(SQL_DIR, 'user_insert.sql'), 'utf-8').catch(() => ''),
  ]);

  return {
    users,
    sessions: authService.listSessions(),
    totalUsers: users.length,
    adminCount: users.filter(u => u.role === 'admin').length,
    developerCount: users.filter(u => u.role === 'developer').length,
    schemaSql,
    seedSql,
  };
}
