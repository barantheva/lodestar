import { describe, expect, it } from 'bun:test';
import { escapeHtml } from './escape-html.ts';

describe('escapeHtml', () => {
  it('escapes the 5 HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert('x')&"</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;&lt;/script&gt;'
    );
  });

  it('neutralizes a reflected-XSS payload so it renders as inert text, not markup', () => {
    const payload = '<img src=x onerror=alert(document.cookie)>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
  });

  it('neutralizes an attribute-breakout payload', () => {
    const payload = '"><script>alert(1)</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain('<script>');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('fix: token refresh race')).toBe('fix: token refresh race');
  });
});
