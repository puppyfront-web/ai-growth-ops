import OpenAI from 'openai';
import type { LLMClient, LLMConfig, LLMMessage, LLMResponse } from './types.js';

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
    this.model = config.model || 'gpt-4o';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }

  getProvider() { return 'openai' as const; }
  getModel() { return this.model; }

  async chat(messages: LLMMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<LLMResponse> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      temperature: options?.temperature ?? 0.7,
      messages: messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
    });

    const choice = response.choices[0];

    return {
      text: choice?.message?.content || '',
      model: response.model,
      provider: 'openai',
      tokenUsage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      finishReason: choice?.finish_reason || 'unknown',
      latencyMs: Date.now() - start,
    };
  }
}
