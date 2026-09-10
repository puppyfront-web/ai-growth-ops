import type { LLMClient, LLMConfig, LLMProvider } from './types.js';
import { AnthropicClient } from './anthropic-client.js';
import { OpenAIClient } from './openai-client.js';

function isPlaceholderKey(apiKey: string): boolean {
  return !apiKey || /CHANGE_ME/i.test(apiKey);
}

export function createLLMClient(config?: Partial<LLMConfig>): LLMClient {
  const provider: LLMProvider =
    config?.provider ||
    (process.env.LLM_PROVIDER as LLMProvider) ||
    (process.env.AI_PROVIDER as LLMProvider) ||
    'openai';
  const apiKey =
    config?.apiKey ||
    (provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY || process.env.AI_API_KEY) ||
    '';
  const baseUrl =
    config?.baseUrl ||
    (provider === 'anthropic'
      ? process.env.ANTHROPIC_BASE_URL
      : process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL);
  const model =
    config?.model ||
    (provider === 'anthropic'
      ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6-20250514'
      : process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o');

  const fullConfig: LLMConfig = { provider, apiKey, baseUrl, model, ...config };
  if (isPlaceholderKey(fullConfig.apiKey)) {
    throw new Error(
      'AI 服务未配置，请在「集成配置 → LLM」中填写有效的 API Key'
    );
  }

  switch (fullConfig.provider) {
    case 'anthropic':
      return new AnthropicClient(fullConfig);
    case 'openai':
      return new OpenAIClient(fullConfig);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
