import { OpenAiCompatibleAdapter, type OpenAiCompatibleOptions } from './openai-compatible-adapter.ts';

export class OpenAiAdapter extends OpenAiCompatibleAdapter {
  public readonly name = 'openai';
  public readonly provider = 'openai';

  constructor(apiKey: string, options: OpenAiCompatibleOptions = {}) {
    super(
      apiKey,
      options.model || process.env.OPENAI_MODEL || 'gpt-4o',
      options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      options
    );
  }
}
