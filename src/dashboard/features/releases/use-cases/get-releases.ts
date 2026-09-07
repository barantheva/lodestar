import type { DashboardDeps } from '../../../dashboard-deps.ts';
import type { TagInfo } from '../../../../plugins/tools/git-tool.ts';

export interface ReleasesData {
  repoPath: string;
  tags: TagInfo[];
}

export async function getReleases(deps: Pick<DashboardDeps, 'registry' | 'baseDir'>): Promise<ReleasesData> {
  const repoPath = deps.baseDir || process.cwd();
  const gitTool = deps.registry.getTool<any, any>('git');
  const res = await gitTool?.execute({ action: 'list_tags', repoPath });

  return { repoPath, tags: res?.data?.tags || [] };
}
