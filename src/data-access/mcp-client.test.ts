import { describe, it, expect, afterEach } from 'bun:test';
import { McpClient } from './mcp-client';

describe('McpClient', () => {
  let client: McpClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.stop();
      client = null;
    }
  });

  it('validates constructor options for stdio and http', async () => {
    const badHttp = new McpClient({ mode: 'http' });
    expect(badHttp.start()).rejects.toThrow('MCP HTTP mode requires a valid url');

    const badStdio = new McpClient({ mode: 'stdio', command: [] });
    expect(badStdio.start()).rejects.toThrow('MCP stdio mode requires a command array');
  });

  it('executes stdio JSON-RPC requests via mock echo process', async () => {
    // Node / Bun echo script that reads JSON-RPC line and replies with response
    client = new McpClient({
      mode: 'stdio',
      command: [
        'bun',
        '-e',
        `
        const readline = require("readline");
        const rl = readline.createInterface({ input: process.stdin });
        console.log("some non-json noise");
        rl.on("line", (line) => {
          const req = JSON.parse(line);
          if (req.method === "tools/list") {
            console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "test_tool" }] } }));
          } else if (req.method === "tools/call") {
            if (req.params?.name === "fail") {
              console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: "Tool failed intentionally" }] } }));
            } else if (req.params?.name === "raw") {
              console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: "plain string result" }] } }));
            } else {
              console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: JSON.stringify({ echo: req.params }) }] } }));
            }
          } else if (req.method === "error_method") {
            console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }));
          } else {
            console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { ok: true } }));
          }
        });
      `,
      ],
    });

    await client.start();

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');

    const callResult = await client.callTool<{ echo: Record<string, unknown> }>('sample_tool', { x: 1 });
    expect(callResult.echo.name).toBe('sample_tool');

    const rawResult = await client.callTool<string>('raw', {});
    expect(rawResult).toBe('plain string result');

    expect(client.callTool('fail', {})).rejects.toThrow('Tool fail failed: Tool failed intentionally');
    expect(client.callMethod('error_method')).rejects.toThrow('MCP error -32601: Method not found');
  });

  it('executes HTTP JSON-RPC requests via mock server', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = (await req.json()) as { method: string; id: number; params?: { name?: string } };
        if (body.method === 'http_error') {
          return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Server error' } });
        }
        if (body.method === 'status_error') {
          return new Response('Internal Server Error', { status: 500 });
        }
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { received: body.method },
        });
      },
    });

    client = new McpClient({
      mode: 'http',
      url: `http://localhost:${server.port}`,
    });

    const res = await client.callMethod<{ received: string }>('ping');
    expect(res.received).toBe('ping');

    expect(client.callMethod('http_error')).rejects.toThrow('MCP error -32000: Server error');
    expect(client.callMethod('status_error')).rejects.toThrow('MCP HTTP request failed with status 500');

    server.stop(true);
  });

  it('handles timeouts properly', async () => {
    client = new McpClient({
      mode: 'stdio',
      command: [
        'bun',
        '-e',
        `
        const readline = require("readline");
        const rl = readline.createInterface({ input: process.stdin });
        rl.on("line", () => {
          // deliberately do nothing to cause timeout
        });
      `,
      ],
      timeoutMs: 150,
    });

    expect(client.callMethod('hang')).rejects.toThrow('MCP request timeout after 150ms for method hang');
  });
});
