import type { DashboardDeps } from '../../../dashboard-deps.ts';
import { GraphMemory, type RepoGraphMap } from '../../../../plugins/memory/graph-memory.ts';

export interface KnowledgeSnapshot {
  repo?: string;
  graph: RepoGraphMap | null;
}

export async function getKnowledgeSnapshot(deps: Pick<DashboardDeps, 'config' | 'memoryBackend'>): Promise<KnowledgeSnapshot> {
  const repo = deps.config.githubRepos[0];
  if (!repo) return { graph: null };

  const graphMemory = new GraphMemory(deps.memoryBackend);
  const graph = await graphMemory.getCachedGraph(repo);
  return { repo, graph };
}
