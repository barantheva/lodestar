import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SetupStatus {
  skillInstalled: boolean;
  envGenerated: boolean;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

export async function getSetupStatus(baseDir: string = process.cwd()): Promise<SetupStatus> {
  const [skillInstalled, envGenerated] = await Promise.all([
    exists(path.join(baseDir, 'skills', 'lodestar', 'SKILL.md')),
    exists(path.join(baseDir, '.env')),
  ]);

  return { skillInstalled, envGenerated };
}
