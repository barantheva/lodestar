import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface WorkflowConfig {
  deploy?: string;
  rollback?: string;
}

export function parseWorkflowFile(content: string): WorkflowConfig {
  const config: WorkflowConfig = {};
  const deployMatch = content.match(/^Deploy:\s*(.+)$/m);
  const rollbackMatch = content.match(/^Rollback:\s*(.+)$/m);
  if (deployMatch) config.deploy = deployMatch[1].trim();
  if (rollbackMatch) config.rollback = rollbackMatch[1].trim();
  return config;
}

export async function readWorkflowConfig(baseDir: string = process.cwd()): Promise<WorkflowConfig> {
  const content = await fs.readFile(path.join(baseDir, 'flight-deck', 'workflow.md'), 'utf-8').catch(() => undefined);
  return content ? parseWorkflowFile(content) : {};
}
