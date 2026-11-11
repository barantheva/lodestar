import type { DashboardDeps } from '../../../dashboard-deps.ts';
import type { TagInfo } from '../../../../plugins/tools/git-tool.ts';
import { listTracks, type TrackRecord } from '../../../../services/monitor-service/track-reader.ts';

function formatDefaultReleaseTag(shortSha: string, date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}-${shortSha}`;
}

export interface CreateReleasePreview {
  repoPath: string;
  headShortSha: string;
  tag: string;
  changelogFilename: string;
  changelogDraft: string;
  lastTag?: TagInfo;
  sinceLastTag: TrackRecord[];
}

function draftChangelog(sinceLastTag: TrackRecord[]): string {
  if (sinceLastTag.length === 0) {
    return 'No shipped tracks since the last tag.';
  }
  const lines = sinceLastTag.map(t => `- ${t.issueTitle || t.trackId} (${t.trackId}${t.repo ? `, ${t.repo}` : ''})`);
  return `## Issues Fixed\n${lines.join('\n')}`;
}

export async function getCreateReleasePreview(deps: Pick<DashboardDeps, 'registry' | 'baseDir'>): Promise<CreateReleasePreview> {
  const repoPath = deps.baseDir || process.cwd();
  const gitTool = deps.registry.getTool<any, any>('git');

  const [headRes, tagsRes, tracks] = await Promise.all([
    gitTool?.execute({ action: 'head_sha', repoPath }),
    gitTool?.execute({ action: 'list_tags', repoPath }),
    listTracks(deps.baseDir),
  ]);

  const headShortSha = headRes?.data?.commitHash || '0000000';
  const tags: TagInfo[] = tagsRes?.data?.tags || [];
  const lastTag = tags[0];
  const lastTagAt = lastTag ? new Date(lastTag.createdAt).getTime() : 0;

  const tag = formatDefaultReleaseTag(headShortSha);

  const sinceLastTag = tracks.filter(t => t.status === 'shipped' && (t.shippedAt || 0) > lastTagAt);

  return {
    repoPath,
    headShortSha,
    tag,
    changelogFilename: `change-log-${tag}.md`,
    changelogDraft: draftChangelog(sinceLastTag),
    lastTag,
    sinceLastTag,
  };
}
