import type { Tool, ToolParameters, ToolResult } from '../../core/interfaces/tool-interface.ts';

export interface GithubToolArgs {
  action: 'list_issues' | 'get_issue' | 'create_pr' | 'create_comment' | 'create_issue';
  repo: string; // "owner/name"
  token?: string;
  labels?: string[];
  state?: 'open' | 'closed' | 'all';
  issueNumber?: number;
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  draft?: boolean;
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  author: string;
  htmlUrl: string;
  createdAt: string;
}

export interface GithubPR {
  number: number;
  title: string;
  htmlUrl: string;
  branch: string;
  draft: boolean;
}

export class GithubTool implements Tool<GithubToolArgs, unknown> {
  public readonly name = 'github';
  public readonly description = 'Interacts with GitHub REST API for issues, pull requests, and comments';

  public readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_issues', 'get_issue', 'create_pr', 'create_comment', 'create_issue'],
        description: 'GitHub operation to execute',
      },
      repo: { type: 'string', description: 'Repository identifier in owner/repo format' },
      token: { type: 'string', description: 'GitHub personal access token or app token' },
      labels: { type: 'string', description: 'Labels filter for issues' },
      state: { type: 'string', description: 'Issue state filter for list_issues: open (default), closed, or all' },
      issueNumber: { type: 'number', description: 'Issue or PR number' },
      title: { type: 'string', description: 'PR or Issue title' },
      body: { type: 'string', description: 'Markdown body content' },
      head: { type: 'string', description: 'Head branch name for PR' },
      base: { type: 'string', description: 'Base branch name for PR (default main)' },
      draft: { type: 'boolean', description: 'Whether to create a draft PR' },
    },
    required: ['action', 'repo'],
  };

  private customFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  constructor(customFetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    this.customFetch = customFetch || globalThis.fetch;
  }

  public async execute(
    args: GithubToolArgs,
    context?: { env?: Record<string, string> }
  ): Promise<ToolResult<unknown>> {
    let token = args.token;
    if (token === undefined) {
      token = context?.env?.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
    }

    if (!token || token.trim() === '') {
      return { success: false, error: 'Missing GitHub authentication token' };
    }

    const headers = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Lodestar-Software-Factory/0.1.0',
      'Content-Type': 'application/json',
    };

    const baseUrl = 'https://api.github.com';

    try {
      switch (args.action) {
        case 'list_issues': {
          const params = new URLSearchParams({ state: args.state ?? 'open', per_page: '100' });
          if (args.labels && args.labels.length > 0) {
            params.set('labels', args.labels.join(','));
          }

          const rawIssues: any[] = [];
          // ponytail: 10-page cap (1,000 issues) bounds API calls per poll; switch to search API or `since` if a repo outgrows it.
          for (let page = 1; page <= 10; page++) {
            params.set('page', String(page));
            const res = await this.customFetch(`${baseUrl}/repos/${args.repo}/issues?${params.toString()}`, { headers });

            if (!res.ok) {
              const errText = await res.text();
              return { success: false, error: `GitHub API error ${res.status}: ${errText}` };
            }

            const batch = (await res.json()) as any[];
            rawIssues.push(...batch);
            if (batch.length < 100) break;
          }

          const issues: GithubIssue[] = rawIssues
            .filter(i => !i.pull_request) // Filter out PRs returned by the issues endpoint
            .map(i => ({
              number: i.number,
              title: i.title,
              body: i.body || '',
              labels: (i.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
              author: i.user?.login || 'unknown',
              htmlUrl: i.html_url,
              createdAt: i.created_at,
            }));

          return { success: true, data: issues };
        }

        case 'get_issue': {
          if (!args.issueNumber) {
            return { success: false, error: 'Missing issueNumber for get_issue action' };
          }
          const url = `${baseUrl}/repos/${args.repo}/issues/${args.issueNumber}`;
          const res = await this.customFetch(url, { headers });

          if (!res.ok) {
            const errText = await res.text();
            return { success: false, error: `GitHub API error ${res.status}: ${errText}` };
          }

          const raw = (await res.json()) as any;
          const issue: GithubIssue = {
            number: raw.number,
            title: raw.title,
            body: raw.body || '',
            labels: (raw.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
            author: raw.user?.login || 'unknown',
            htmlUrl: raw.html_url,
            createdAt: raw.created_at,
          };

          return { success: true, data: issue };
        }

        case 'create_pr': {
          if (!args.title || !args.head) {
            return { success: false, error: 'Missing title or head branch for create_pr action' };
          }

          const url = `${baseUrl}/repos/${args.repo}/pulls`;
          const payload = {
            title: args.title,
            body: args.body || '',
            head: args.head,
            base: args.base || 'main',
            draft: args.draft ?? false,
          };

          const res = await this.customFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errText = await res.text();
            return { success: false, error: `Failed to create PR (${res.status}): ${errText}` };
          }

          const raw = (await res.json()) as any;
          const pr: GithubPR = {
            number: raw.number,
            title: raw.title,
            htmlUrl: raw.html_url,
            branch: args.head,
            draft: raw.draft ?? false,
          };

          return { success: true, data: pr };
        }

        case 'create_comment': {
          if (!args.issueNumber || !args.body) {
            return { success: false, error: 'Missing issueNumber or body for create_comment action' };
          }

          const url = `${baseUrl}/repos/${args.repo}/issues/${args.issueNumber}/comments`;
          const res = await this.customFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ body: args.body }),
          });

          if (!res.ok) {
            const errText = await res.text();
            return { success: false, error: `Failed to post comment (${res.status}): ${errText}` };
          }

          const raw = (await res.json()) as any;
          return { success: true, data: { id: raw.id, htmlUrl: raw.html_url } };
        }

        case 'create_issue': {
          if (!args.title) {
            return { success: false, error: 'Missing title for create_issue action' };
          }

          const url = `${baseUrl}/repos/${args.repo}/issues`;
          const payload = {
            title: args.title,
            body: args.body || '',
            labels: args.labels || [],
          };

          const res = await this.customFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errText = await res.text();
            return { success: false, error: `Failed to create issue (${res.status}): ${errText}` };
          }

          const raw = (await res.json()) as any;
          const issue: GithubIssue = {
            number: raw.number,
            title: raw.title,
            body: raw.body || '',
            labels: (raw.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
            author: raw.user?.login || 'unknown',
            htmlUrl: raw.html_url,
            createdAt: raw.created_at,
          };

          return { success: true, data: issue };
        }

        default:
          return { success: false, error: `Unsupported action: ${(args as any).action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
