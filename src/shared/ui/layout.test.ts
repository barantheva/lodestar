import { describe, expect, it } from 'bun:test';
import { renderLayout } from './layout.ts';

describe('renderLayout', () => {
  it('marks the active screen nav item and embeds the page title and body', () => {
    const html = renderLayout({ activeScreen: 'fleet', title: 'My fleet', bodyHtml: '<section>FLEET BODY</section>' });

    expect(html).toContain('<title>My fleet — Lodestar</title>');
    expect(html).toContain('<section>FLEET BODY</section>');
    expect(html).toContain('class="nav-item active" href="/fleet"');
  });

  it('renders a nav badge only when one is provided for that screen', () => {
    const withBadge = renderLayout({ activeScreen: 'stats', title: 'X', bodyHtml: '', navBadges: { relay: 2 } });
    expect(withBadge).toContain('🚦 Relay Pipeline <span class="nav-badge">2</span>');

    const withoutBadge = renderLayout({ activeScreen: 'stats', title: 'X', bodyHtml: '' });
    expect(withoutBadge).not.toContain('<span class="nav-badge">');
  });

  it('hides the admin-only Users Registry nav item for non-admin users', () => {
    const asDeveloper = renderLayout({ activeScreen: 'stats', title: 'X', bodyHtml: '', user: { username: 'developer', role: 'developer' } });
    expect(asDeveloper).not.toContain('href="/users"');

    const asAdmin = renderLayout({ activeScreen: 'stats', title: 'X', bodyHtml: '', user: { username: 'admin', role: 'admin' } });
    expect(asAdmin).toContain('href="/users"');

    const anonymous = renderLayout({ activeScreen: 'stats', title: 'X', bodyHtml: '' });
    expect(anonymous).not.toContain('href="/users"');
  });
});
