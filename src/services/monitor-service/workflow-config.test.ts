import { describe, expect, it, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseWorkflowFile, readWorkflowConfig } from './workflow-config.ts';

describe('parseWorkflowFile', () => {
  it('extracts a Deploy: command', () => {
    const content = 'Deploy: bun run deploy.ts\n';
    expect(parseWorkflowFile(content)).toEqual({ deploy: 'bun run deploy.ts' });
  });

  it('extracts both Deploy: and Rollback: commands', () => {
    const content = ['# Workflow', 'Deploy: ./scripts/deploy.sh', 'Rollback: ./scripts/rollback.sh', ''].join('\n');
    expect(parseWorkflowFile(content)).toEqual({ deploy: './scripts/deploy.sh', rollback: './scripts/rollback.sh' });
  });

  it('returns an empty config when no Deploy: line exists (opt-out by default)', () => {
    expect(parseWorkflowFile('# Just notes, no deploy declared')).toEqual({});
  });
});

describe('readWorkflowConfig', () => {
  const testBaseDir = path.join(process.cwd(), '.test-workflow-config-' + Date.now());

  afterEach(async () => {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  });

  it('returns an empty config when flight-deck/workflow.md does not exist', async () => {
    expect(await readWorkflowConfig(testBaseDir)).toEqual({});
  });

  it('reads and parses a real workflow.md from disk', async () => {
    await fs.mkdir(path.join(testBaseDir, 'flight-deck'), { recursive: true });
    await fs.writeFile(path.join(testBaseDir, 'flight-deck', 'workflow.md'), 'Deploy: bun run deploy.ts\n', 'utf-8');

    expect(await readWorkflowConfig(testBaseDir)).toEqual({ deploy: 'bun run deploy.ts' });
  });
});
