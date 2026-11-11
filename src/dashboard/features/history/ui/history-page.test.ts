import { describe, expect, it } from 'bun:test';
import { renderHistoryPage } from './history-page.ts';

describe('renderHistoryPage', () => {
  it('escapes a hostile GitHub issue title so it renders as inert text, not markup', () => {
    const html = renderHistoryPage({
      shippedTracks: [
        {
          trackId: 'track_owner-repo_1',
          repo: 'owner/repo',
          issueNumber: 1,
          issueTitle: '<script>alert(document.cookie)</script>',
          status: 'shipped',
          archetype: 'C',
          guard3SignedBy: 'lead',
        },
      ],
    });

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
