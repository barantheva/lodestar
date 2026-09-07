import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DashboardDeps } from '../../../dashboard-deps.ts';

export interface CreateReleaseInput {
  tag: string;
  changelogFilename: string;
  changelogContent: string;
}

export interface CreateReleaseResult {
  success: boolean;
  tag?: string;
  error?: string;
}

export async function createRelease(
  deps: Pick<DashboardDeps, 'registry' | 'baseDir'>,
  input: CreateReleaseInput
): Promise<CreateReleaseResult> {
  const repoPath = deps.baseDir || process.cwd();
  const gitTool = deps.registry.getTool<any, any>('git');

  const changelogRelPath = path.join('changelogs', input.changelogFilename);
  await fs.mkdir(path.join(repoPath, 'changelogs'), { recursive: true });
  await fs.writeFile(path.join(repoPath, changelogRelPath), input.changelogContent, 'utf-8');

  const res = await gitTool?.execute({
    action: 'release_tag',
    tag: input.tag,
    changelogPath: changelogRelPath,
    repoPath,
  });

  if (!res?.success) {
    return { success: false, error: res?.error || 'git tool unavailable' };
  }

  return { success: true, tag: input.tag };
}
