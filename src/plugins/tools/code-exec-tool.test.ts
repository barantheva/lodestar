import { describe, expect, it } from 'bun:test';
import { CodeExecTool } from './code-exec-tool.ts';

describe('CodeExecTool', () => {
  const tool = new CodeExecTool();

  it('executes simple echo command successfully', async () => {
    const res = await tool.execute({ command: 'echo "hello Lodestar"' });
    expect(res.success).toBe(true);
    expect(res.data?.stdout.trim()).toBe('hello Lodestar');
    expect(res.data?.exitCode).toBe(0);
    expect(res.data?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles non-zero exit codes', async () => {
    const res = await tool.execute({ command: 'exit 42' });
    expect(res.success).toBe(false);
    expect(res.data?.exitCode).toBe(42);
    expect(res.error).toContain('non-zero code 42');
  });

  it('handles timeouts properly', async () => {
    const res = await tool.execute({ command: 'sleep 2', timeoutMs: 50 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('timed out after 50ms');
    expect(res.data?.exitCode).toBe(-1);
  });

  it('respects cwd context and custom environment variables', async () => {
    const res = await tool.execute(
      { command: 'echo "$CUSTOM_VAR"' },
      { env: { CUSTOM_VAR: 'super_secret_value' } }
    );
    expect(res.success).toBe(true);
    expect(res.data?.stdout.trim()).toBe('super_secret_value');
  });

  it('handles invalid cwd error cleanly', async () => {
    const res = await tool.execute({
      command: 'echo "test"',
      cwd: '/path/that/does/not/exist_at_all',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});
