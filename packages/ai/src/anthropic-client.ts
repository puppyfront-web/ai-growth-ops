import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMClient,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMToolResponse,
  ChatWithToolsOptions,
  ToolCall,
  ToolResult
} from './types.js';

export class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-sonnet-4-6-20250514';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }

  getProvider() {
    return 'anthropic' as const;
  }
  getModel() {
    return this.model;
  }

  async chat(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    const start = Date.now();

    // Extract system message
    const systemMsg = messages.find((m) => m.role === 'system')?.content;
    const chatMessages = messages.filter(
      (m) => m.role !== 'system'
    ) as Anthropic.MessageParam[];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      temperature: options?.temperature ?? 0.7,
      system: systemMsg || undefined,
      messages: chatMessages
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    return {
      text,
      model: response.model,
      provider: 'anthropic',
      tokenUsage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason || 'unknown',
      latencyMs: Date.now() - start
    };
  }

  async chatWithTools(
    messages: LLMMessage[],
    options: ChatWithToolsOptions
  ): Promise<LLMToolResponse> {
    const start = Date.now();
    const maxRounds = options.maxToolRounds ?? 5;
    const tools = options.tools || [];

    // Extract system message
    const systemMsg = messages.find((m) => m.role === 'system')?.content;
    const chatMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Build Anthropic tool format
    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema
    }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let round = 0;

    while (round <= maxRounds) {
      const requestParams: Anthropic.MessageCreateParams = {
        model: this.model,
        max_tokens: options.maxTokens || this.defaultMaxTokens,
        temperature: options.temperature ?? 0.7,
        system: systemMsg || undefined,
        messages: chatMessages
      };

      if (anthropicTools.length > 0) {
        requestParams.tools = anthropicTools;
      }

      const response = await this.client.messages.create(requestParams);

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Extract text and tool calls from response
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>
          });
        }
      }

      const text = textParts.join('');

      // If no tool calls or no onToolCall handler, return immediately
      if (toolCalls.length === 0 || !options.onToolCall) {
        return {
          text,
          model: response.model,
          provider: 'anthropic',
          tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens
          },
          finishReason: response.stop_reason || 'unknown',
          latencyMs: Date.now() - start,
          toolCalls
        };
      }

      // Execute tool calls
      const toolResults: ToolResult[] = await Promise.all(
        toolCalls.map((tc) => options.onToolCall!(tc))
      );

      // Append assistant message with tool_use blocks
      chatMessages.push({
        role: 'assistant',
        content: response.content as Anthropic.ContentBlockParam[]
      });

      // Append tool_result blocks
      const toolResultContent: Anthropic.ToolResultBlockParam[] = toolResults.map(
        (tr) => ({
          type: 'tool_result',
          tool_use_id: tr.toolCallId,
          content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output)
        })
      );

      chatMessages.push({
        role: 'user',
        content: toolResultContent
      });

      round++;
    }

    // Max rounds exceeded — return last state
    return {
      text: '',
      model: this.model,
      provider: 'anthropic',
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens
      },
      finishReason: 'max_rounds_exceeded',
      latencyMs: Date.now() - start,
      toolCalls: []
    };
  }
}
