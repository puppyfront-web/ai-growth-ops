import OpenAI from 'openai';
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

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'gpt-4o';
    this.defaultMaxTokens = config.maxTokens || 4096;
  }

  getProvider() {
    return 'openai' as const;
  }
  getModel() {
    return this.model;
  }

  async chat(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      temperature: options?.temperature ?? 0.7,
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content
      }))
    });

    const choice = response.choices[0];

    return {
      text: choice?.message?.content || '',
      model: response.model,
      provider: 'openai',
      tokenUsage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      finishReason: choice?.finish_reason || 'unknown',
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

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content
      }));

    // Build OpenAI function-calling tool format
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map(
      (t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      })
    );

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let round = 0;

    while (round <= maxRounds) {
      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams =
        {
          model: this.model,
          max_tokens: options.maxTokens || this.defaultMaxTokens,
          temperature: options.temperature ?? 0.7,
          messages: chatMessages
        };

      if (openaiTools.length > 0) {
        requestParams.tools = openaiTools;
      }

      const response =
        await this.client.chat.completions.create(requestParams);

      totalInputTokens += response.usage?.prompt_tokens || 0;
      totalOutputTokens += response.usage?.completion_tokens || 0;

      const choice = response.choices[0];
      const message = choice?.message;

      if (!message) {
        return {
          text: '',
          model: response.model,
          provider: 'openai',
          tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens
          },
          finishReason: 'no_response',
          latencyMs: Date.now() - start,
          toolCalls: []
        };
      }

      const text = message.content || '';
      const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>
      }));

      // If no tool calls or no onToolCall handler, return immediately
      if (toolCalls.length === 0 || !options.onToolCall) {
        return {
          text,
          model: response.model,
          provider: 'openai',
          tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens
          },
          finishReason: choice?.finish_reason || 'unknown',
          latencyMs: Date.now() - start,
          toolCalls
        };
      }

      // Append assistant message with tool calls
      chatMessages.push({
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls
      });

      // Execute tool calls and append results
      const toolResults: ToolResult[] = await Promise.all(
        toolCalls.map((tc) => options.onToolCall!(tc))
      );

      for (const tr of toolResults) {
        chatMessages.push({
          role: 'tool',
          tool_call_id: tr.toolCallId,
          content:
            typeof tr.output === 'string'
              ? tr.output
              : JSON.stringify(tr.output)
        });
      }

      round++;
    }

    // Max rounds exceeded
    return {
      text: '',
      model: this.model,
      provider: 'openai',
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
