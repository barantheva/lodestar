import { describe, expect, it } from 'bun:test';
import { GithubTool, type GithubIssue, type GithubPR } from './github-tool.ts';

type CustomFetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

describe('GithubTool', () => {
  it('fails when token is missing', async () => {
    const tool = new GithubTool();
    const res = await tool.execute({
      action: 'list_issues',
      repo: 'test-org/repo',
      token: '',
    }, { env: { GITHUB_TOKEN: '' } });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Missing GitHub authentication token');
  });

  it('lists issues and filters out PRs successfully', async () => {
    const mockFetch: CustomFetchFn = async (input, init) => {
      expect(input.toString()).toContain('/repos/test-org/repo/issues');
      expect(init?.headers).toBeDefined();

      return new Response(
        JSON.stringify([
          {
            number: 42,
            title: 'Fix race condition in poller',
            body: 'Detailed description of the issue',
            labels: [{ name: 'bug' }, { name: 'lodestar' }],
            user: { login: 'developer-1' },
            html_url: 'https://github.com/test-org/repo/issues/42',
            created_at: '2026-09-07T00:00:00Z',
          },
          {
            number: 43,
            title: 'Existing Pull Request',
            pull_request: { url: 'https://api.github.com/repos/test-org/repo/pulls/43' },
          },
        ]),
        { status: 200 }
      );
    };

    const tool = new GithubTool(mockFetch);
    const res = await tool.execute({
      action: 'list_issues',
      repo: 'test-org/repo',
      token: 'ghp_test_token',
      labels: ['bug'],
    });

    expect(res.success).toBe(true);
    const issues = res.data as GithubIssue[];
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(42);
    expect(issues[0].labels).toEqual(['bug', 'lodestar']);
    expect(issues[0].author).toBe('developer-1');
  });

  it('paginates list_issues past the first 100 and forwards the state filter', async () => {
    const urls: string[] = [];
    const mockFetch: CustomFetchFn = async input => {
      urls.push(input.toString());
      const page = Number(new URL(input.toString()).searchParams.get('page'));
      const count = page === 1 ? 100 : 7;
      return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => ({ number: page * 1000 + i, title: 't', labels: [] }))));
    };

    const res = await new GithubTool(mockFetch).execute({ action: 'list_issues', repo: 'o/r', token: 't', state: 'all' });
    expect((res.data as GithubIssue[]).length).toBe(107);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('state=all');
    expect(urls[0]).toContain('per_page=100');
  });

  it('creates pull request successfully', async () => {
    const mockFetch: CustomFetchFn = async (input, init) => {
      expect(input.toString()).toContain('/repos/test-org/repo/pulls');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.title).toBe('feat: resolved issue #42');
      expect(body.head).toBe('track/issue-42');

      return new Response(
        JSON.stringify({
          number: 101,
          title: body.title,
          html_url: 'https://github.com/test-org/repo/pull/101',
          draft: false,
        }),
        { status: 201 }
      );
    };

    const tool = new GithubTool(mockFetch);
    const res = await tool.execute({
      action: 'create_pr',
      repo: 'test-org/repo',
      token: 'ghp_test_token',
      title: 'feat: resolved issue #42',
      body: 'Verified via Lodestar',
      head: 'track/issue-42',
    });

    expect(res.success).toBe(true);
    const pr = res.data as GithubPR;
    expect(pr.number).toBe(101);
    expect(pr.branch).toBe('track/issue-42');
  });

  it('posts issue comment successfully', async () => {
    const mockFetch: CustomFetchFn = async (input, init) => {
      expect(input.toString()).toContain('/repos/test-org/repo/issues/42/comments');
      return new Response(
        JSON.stringify({ id: 999, html_url: 'https://github.com/test-org/repo/issues/42#comment-999' }),
        { status: 201 }
      );
    };

    const tool = new GithubTool(mockFetch);
    const res = await tool.execute({
      action: 'create_comment',
      repo: 'test-org/repo',
      token: 'ghp_test_token',
      issueNumber: 42,
      body: 'Track opened for issue #42',
    });

    expect(res.success).toBe(true);
  });

  it('creates an issue successfully with labels and body', async () => {
    const mockFetch: CustomFetchFn = async (input, init) => {
      expect(input.toString()).toContain('/repos/test-org/repo/issues');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.title).toBe('[UX Friction: Rage Clicks] button#pay-now on /checkout');
      expect(body.labels).toEqual(['behavior', 'clarity']);

      return new Response(
        JSON.stringify({
          number: 55,
          title: body.title,
          body: body.body,
          labels: [{ name: 'behavior' }, { name: 'clarity' }],
          user: { login: 'lodestar-bot' },
          html_url: 'https://github.com/test-org/repo/issues/55',
          created_at: '2026-09-11T12:00:00Z',
        }),
        { status: 201 }
      );
    };

    const tool = new GithubTool(mockFetch);
    const res = await tool.execute({
      action: 'create_issue',
      repo: 'test-org/repo',
      token: 'ghp_test_token',
      title: '[UX Friction: Rage Clicks] button#pay-now on /checkout',
      body: 'High rage clicks detected on /checkout',
      labels: ['behavior', 'clarity'],
    });

    expect(res.success).toBe(true);
    const issue = res.data as GithubIssue;
    expect(issue.number).toBe(55);
    expect(issue.title).toBe('[UX Friction: Rage Clicks] button#pay-now on /checkout');
    expect(issue.labels).toEqual(['behavior', 'clarity']);
    expect(issue.author).toBe('lodestar-bot');
  });
});
