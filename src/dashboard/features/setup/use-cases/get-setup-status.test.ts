import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getSetupStatus } from './get-setup-status.ts';

describe('getSetupStatus', () => {
  const testBaseDir = path.join(process.cwd(), '.test-setup-status-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('reports both steps false when neither the skill nor .env exists', async () => {
    await fs.mkdir(testBaseDir, { recursive: true });
    const status = await getSetupStatus(testBaseDir);
    expect(status.skillInstalled).toBe(false);
    expect(status.envGenerated).toBe(false);
  });

  it('reports real presence when the skill file and .env exist on disk', async () => {
    await fs.mkdir(path.join(testBaseDir, 'skills', 'lodestar'), { recursive: true });
    await fs.writeFile(path.join(testBaseDir, 'skills', 'lodestar', 'SKILL.md'), '# skill', 'utf-8');
    await fs.writeFile(path.join(testBaseDir, '.env'), 'GITHUB_TOKEN=x', 'utf-8');

    const status = await getSetupStatus(testBaseDir);
    expect(status.skillInstalled).toBe(true);
    expect(status.envGenerated).toBe(true);
  });
});
