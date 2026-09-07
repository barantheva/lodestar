import { OpenAiCompatibleAdapter, type OpenAiCompatibleOptions } from './openai-compatible-adapter.ts';

export class DeepseekAdapter extends OpenAiCompatibleAdapter {
  public readonly name = 'deepseek';
  public readonly provider = 'deepseek';

  constructor(apiKey: string, options: OpenAiCompatibleOptions = {}) {
    super(
      apiKey,
      options.model || process.env.DEEPSEEK_MODEL || 'deepseek-coder',
      options.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      options
    );
  }
}
