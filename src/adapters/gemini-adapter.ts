import type { AgentAdapter, AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

export interface GeminiAdapterOptions {
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiAdapter implements AgentAdapter {
  public readonly name = 'gemini';
  public readonly provider = 'gemini';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private controllers: Map<string, AbortController> = new Map();

  constructor(apiKey: string, options: GeminiAdapterOptions = {}) {
    this.apiKey = apiKey;
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    this.baseUrl = options.baseUrl || process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    this.fetchImpl = options.fetchImpl || fetch;
  }

  public async *dispatch(task: AgentTask, sessionId?: string): AsyncIterable<AgentEvent> {
    const activeSessionId = sessionId || task.sessionId || `gemini_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const controller = new AbortController();
    this.controllers.set(activeSessionId, controller);

    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: task.prompt }] }] }),
        signal: controller.signal,
      });
    } catch (err: any) {
      this.controllers.delete(activeSessionId);
      if (err?.name === 'AbortError') return;
      yield { type: 'error', error: err.message, sessionId: activeSessionId };
      return;
    }

    if (response.status === 429) {
      this.controllers.delete(activeSessionId);
      const retryAfter = Number(response.headers.get('retry-after'));
      const resumeAt = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 6 * 3600 * 1000);
      yield { type: 'rate_limit', resumeAt, sessionId: activeSessionId };
      return;
    }

    if (!response.ok || !response.body) {
      this.controllers.delete(activeSessionId);
      yield { type: 'error', error: `Gemini API error: HTTP ${response.status}`, sessionId: activeSessionId };
      return;
    }

    let tokensUsed = { input: 0, output: 0 };
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice('data:'.length).trim();
          if (!payload) continue;

          const chunk = JSON.parse(payload);
          const text = chunk.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
          if (text) {
            yield { type: 'token', content: text, sessionId: activeSessionId };
          }
          if (chunk.usageMetadata) {
            tokensUsed = {
              input: chunk.usageMetadata.promptTokenCount || 0,
              output: chunk.usageMetadata.candidatesTokenCount || 0,
            };
          }
        }
      }
    } catch (err: any) {
      this.controllers.delete(activeSessionId);
      if (err?.name === 'AbortError') return;
      yield { type: 'error', error: err.message, sessionId: activeSessionId };
      return;
    }

    this.controllers.delete(activeSessionId);
    yield { type: 'done', sessionId: activeSessionId, tokensUsed };
  }

  public async cancel(sessionId: string): Promise<void> {
    const controller = this.controllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.controllers.delete(sessionId);
    }
  }
}
