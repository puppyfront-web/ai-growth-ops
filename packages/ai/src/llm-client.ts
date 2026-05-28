import type { LLMClient, LLMConfig, LLMProvider } from './types.js';
import { AnthropicClient } from './anthropic-client.js';
import { OpenAIClient } from './openai-client.js';

export function createLLMClient(config?: Partial<LLMConfig>): LLMClient {
  const provider: LLMProvider = config?.provider || (process.env.LLM_PROVIDER as LLMProvider) || 'openai';
  const apiKey = config?.apiKey || (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || '';
  const baseUrl = config?.baseUrl || (provider === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : process.env.OPENAI_BASE_URL);
  const model = config?.model || (provider === 'anthropic' ? 'claude-sonnet-4-6-20250514' : 'gpt-4o');

  const fullConfig: LLMConfig = { provider, apiKey, baseUrl, model, ...config };

  switch (provider) {
    case 'anthropic':
      return new AnthropicClient(fullConfig);
    case 'openai':
      return new OpenAIClient(fullConfig);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
