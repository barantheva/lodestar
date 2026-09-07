import type { AgentAdapter, AgentEvent, AgentTask } from '../core/interfaces/agent-interface.ts';

export interface OpenAiCompatibleOptions {
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export abstract class OpenAiCompatibleAdapter implements AgentAdapter {
  public abstract readonly name: string;
  public abstract readonly provider: string;

  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private controllers: Map<string, AbortController> = new Map();

  constructor(apiKey: string, defaultModel: string, defaultBaseUrl: string, options: OpenAiCompatibleOptions = {}) {
    this.apiKey = apiKey;
    this.model = options.model || defaultModel;
    this.baseUrl = options.baseUrl || defaultBaseUrl;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  public async *dispatch(task: AgentTask, sessionId?: string): AsyncIterable<AgentEvent> {
    const activeSessionId = sessionId || task.sessionId || `${this.provider}_session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const controller = new AbortController();
    this.controllers.set(activeSessionId, controller);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: task.prompt }],
          stream: true,
        }),
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
      yield { type: 'error', error: `${this.provider} API error: HTTP ${response.status}`, sessionId: activeSessionId };
      return;
    }

    let inputTokens = Math.ceil(task.prompt.length / 4);
    let outputTokens = 0;
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
          if (!payload || payload === '[DONE]') continue;

          const chunk = JSON.parse(payload);
          const text = chunk.choices?.[0]?.delta?.content || '';
          if (text) {
            outputTokens += Math.ceil(text.length / 4);
            yield { type: 'token', content: text, sessionId: activeSessionId };
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
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
    yield { type: 'done', sessionId: activeSessionId, tokensUsed: { input: inputTokens, output: outputTokens } };
  }

  public async cancel(sessionId: string): Promise<void> {
    const controller = this.controllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.controllers.delete(sessionId);
    }
  }
}
