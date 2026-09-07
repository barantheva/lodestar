import { describe, expect, it } from 'bun:test';
import { createOperator } from './create-operator.ts';
import { openAuthDb } from '../../../../data-access/auth-db-client.ts';
import { AuthService } from '../../../../services/auth-service/index.ts';

describe('createOperator', () => {
  it('creates a real new user via AuthService', () => {
    const authService = new AuthService(openAuthDb(':memory:'));

    const result = createOperator(authService, { username: 'newop', password: 'pw123', role: 'developer' });

    expect(result.success).toBe(true);
    expect(authService.listUsers().some(u => u.username === 'newop')).toBe(true);
  });

  it('surfaces a duplicate-username failure without throwing', () => {
    const authService = new AuthService(openAuthDb(':memory:'));

    const result = createOperator(authService, { username: 'admin', password: 'pw123', role: 'admin' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });
});
