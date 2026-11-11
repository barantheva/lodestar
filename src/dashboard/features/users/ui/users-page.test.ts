import { describe, expect, it } from 'bun:test';
import { renderUsersPage } from './users-page.ts';
import type { UsersRegistryData } from '../use-cases/get-users-registry.ts';

describe('renderUsersPage', () => {
  it('escapes a malicious operator name/email/username so it renders as inert text, not markup', () => {
    const data: UsersRegistryData = {
      users: [
        {
          id: 'usr_1',
          username: '<script>alert(1)</script>',
          role: 'developer',
          name: '"><img src=x onerror=alert(document.cookie)>',
          email: 'x@example.com',
        },
      ],
      sessions: [],
      totalUsers: 1,
      adminCount: 0,
      developerCount: 1,
      schemaSql: '',
      seedSql: '',
    };

    const html = renderUsersPage(data);

    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;script&gt;');
  });
});
