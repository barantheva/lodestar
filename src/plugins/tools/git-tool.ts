import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tool, ToolParameters, ToolResult } from '../../core/interfaces/tool-interface.ts';
import { CodeExecTool } from './code-exec-tool.ts';

export interface GitToolArgs {
  action: 'create_worktree' | 'cleanup_worktree' | 'commit' | 'diff' | 'release_tag' | 'list_tags' | 'revert' | 'head_sha';
  trackId?: string;
  repoPath?: string;
  branch?: string;
  baseBranch?: string;
  message?: string;
  tag?: string;
  changelogPath?: string;
  commitHash?: string;
}

export interface TagInfo {
  tag: string;
  commit: string;
  createdAt: string;
}

export interface GitToolResult {
  worktreePath?: string;
  branch?: string;
  diff?: string;
  commitHash?: string;
  tag?: string;
  status?: string;
  tags?: TagInfo[];
}

export class GitTool implements Tool<GitToolArgs, GitToolResult> {
  public readonly name = 'git';
  public readonly description = 'Manages Git worktrees, commits, diffs, branch isolation, and release tagging';

  public readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create_worktree', 'cleanup_worktree', 'commit', 'diff', 'release_tag', 'list_tags', 'revert', 'head_sha'],
        description: 'Git operation to perform',
      },
      trackId: { type: 'string', description: 'Unique track identifier' },
      repoPath: { type: 'string', description: 'Root path of the repository' },
      branch: { type: 'string', description: 'Target branch name' },
      baseBranch: { type: 'string', description: 'Base branch name (default main/master)' },
      message: { type: 'string', description: 'Commit message' },
      tag: { type: 'string', description: 'Release tag name' },
      changelogPath: { type: 'string', description: 'Path to changelog file' },
      commitHash: { type: 'string', description: 'Commit hash to revert' },
    },
    required: ['action'],
  };

  private exec = new CodeExecTool();

  public async execute(
    args: GitToolArgs,
    context?: { worktreePath?: string }
  ): Promise<ToolResult<GitToolResult>> {
    try {
      switch (args.action) {
        case 'create_worktree': {
          if (!args.trackId) {
            return { success: false, error: 'Missing trackId for create_worktree action' };
          }
          const baseRepoPath = args.repoPath || process.cwd();
          const worktreeDir = resolve(baseRepoPath, '.worktrees', args.trackId);
          const branch = args.branch || `track/${args.trackId}`;
          const baseBranch = args.baseBranch || 'HEAD';

          if (!existsSync(resolve(baseRepoPath, '.worktrees'))) {
            mkdirSync(resolve(baseRepoPath, '.worktrees'), { recursive: true });
          }

          const cmd = `git worktree add -B "${branch}" "${worktreeDir}" "${baseBranch}"`;
          const res = await this.exec.execute({ command: cmd, cwd: baseRepoPath });

          if (!res.success) {
            return { success: false, error: `Failed to create worktree: ${res.error}\n${res.data?.stderr}` };
          }

          return {
            success: true,
            data: { worktreePath: worktreeDir, branch, status: 'created' },
          };
        }

        case 'cleanup_worktree': {
          if (!args.trackId) {
            return { success: false, error: 'Missing trackId for cleanup_worktree action' };
          }
          const baseRepoPath = args.repoPath || process.cwd();
          const worktreeDir = resolve(baseRepoPath, '.worktrees', args.trackId);

          if (existsSync(worktreeDir)) {
            await this.exec.execute({ command: `git worktree remove --force "${worktreeDir}"`, cwd: baseRepoPath });
            if (existsSync(worktreeDir)) {
              rmSync(worktreeDir, { recursive: true, force: true });
            }
          }
          await this.exec.execute({ command: 'git worktree prune', cwd: baseRepoPath });

          return {
            success: true,
            data: { worktreePath: worktreeDir, status: 'cleaned' },
          };
        }

        case 'commit': {
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const message = args.message || 'Auto-commit from Lodestar';

          await this.exec.execute({ command: 'git add -A', cwd });
          const commitRes = await this.exec.execute({
            command: `git commit -m "${message.replace(/"/g, '\\"')}"`,
            cwd,
          });

          if (!commitRes.success && !commitRes.data?.stdout.includes('nothing to commit')) {
            return { success: false, error: `Commit failed: ${commitRes.error}` };
          }

          const revRes = await this.exec.execute({ command: 'git rev-parse HEAD', cwd });
          const commitHash = revRes.data?.stdout.trim();

          return {
            success: true,
            data: { commitHash, status: 'committed' },
          };
        }

        case 'diff': {
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const baseBranch = args.baseBranch || 'HEAD';
          const diffRes = await this.exec.execute({ command: `git diff "${baseBranch}"`, cwd });

          return {
            success: true,
            data: { diff: diffRes.data?.stdout || '' },
          };
        }

        case 'release_tag': {
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const revRes = await this.exec.execute({ command: 'git rev-parse --short=7 HEAD', cwd });
          const shortSha = revRes.data?.stdout.trim() || '0000000';

          const tag = args.tag || this.formatDefaultReleaseTag(shortSha);

          if (args.changelogPath && existsSync(resolve(cwd, args.changelogPath))) {
            await this.exec.execute({ command: `git add "${args.changelogPath}"`, cwd });
            await this.exec.execute({ command: `git commit -m "chore(release): ${tag} changelog"`, cwd });
          }

          const tagRes = await this.exec.execute({
            command: `git tag -a "${tag}" -m "Release ${tag}"`,
            cwd,
          });

          return {
            success: tagRes.success,
            data: { tag, commitHash: shortSha, status: 'tagged' },
            error: tagRes.error,
          };
        }

        case 'head_sha': {
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const res = await this.exec.execute({ command: 'git rev-parse --short=7 HEAD', cwd });
          return { success: true, data: { commitHash: res.data?.stdout.trim() || '' } };
        }

        case 'list_tags': {
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const format = '%(refname:short)%09%(objectname:short)%09%(creatordate:iso-strict)';
          const res = await this.exec.execute({
            command: `git for-each-ref refs/tags --sort=-creatordate --format="${format}"`,
            cwd,
          });

          return { success: true, data: { tags: this.parseTagList(res.data?.stdout || '') } };
        }

        case 'revert': {
          if (!args.commitHash) {
            return { success: false, error: 'Missing commitHash for revert action' };
          }
          const cwd = context?.worktreePath || args.repoPath || process.cwd();
          const revertRes = await this.exec.execute({
            command: `git revert -m 1 "${args.commitHash}" --no-edit`,
            cwd,
          });

          if (!revertRes.success) {
            return { success: false, error: `Revert failed: ${revertRes.error}\n${revertRes.data?.stderr}` };
          }

          const revRes = await this.exec.execute({ command: 'git rev-parse HEAD', cwd });

          return {
            success: true,
            data: { commitHash: revRes.data?.stdout.trim(), status: 'reverted' },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${(args as any).action}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public parseTagList(stdout: string): TagInfo[] {
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [tag, commit, createdAt] = line.split('\t');
        return { tag, commit, createdAt };
      });
  }

  public formatDefaultReleaseTag(shortSha: string, date: Date = new Date()): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}-${shortSha}`;
  }
}
