import { OpenAiCompatibleAdapter, type OpenAiCompatibleOptions } from './openai-compatible-adapter.ts';

export class KimiAdapter extends OpenAiCompatibleAdapter {
  public readonly name = 'kimi';
  public readonly provider = 'kimi';

  constructor(apiKey: string, options: OpenAiCompatibleOptions = {}) {
    super(
      apiKey,
      options.model || process.env.KIMI_MODEL || 'moonshot-v1-128k',
      options.baseUrl || process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      options
    );
  }
}
