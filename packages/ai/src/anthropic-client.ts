import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, LLMConfig, LLMMessage, LLMResponse } from './types.js';

export class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    this.model = config.model || 'claude-sonnet-4-6-20250514';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }

  getProvider() { return 'anthropic' as const; }
  getModel() { return this.model; }

  async chat(messages: LLMMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<LLMResponse> {
    const start = Date.now();

    // Extract system message
    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system') as Anthropic.MessageParam[];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      temperature: options?.temperature ?? 0.7,
      system: systemMsg || undefined,
      messages: chatMessages,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    return {
      text,
      model: response.model,
      provider: 'anthropic',
      tokenUsage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason || 'unknown',
      latencyMs: Date.now() - start,
    };
  }
}
