export type LLMProvider = 'anthropic' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: LLMProvider;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  latencyMs: number;
}

export interface LLMClient {
  chat(
    messages: LLMMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse>;
  chatWithTools(
    messages: LLMMessage[],
    options: ChatWithToolsOptions
  ): Promise<LLMToolResponse>;
  getProvider(): LLMProvider;
  getModel(): string;
}

// ── Tool Calling Types ─────────────────────────────────────────

/**
 * A tool specification in JSON Schema format.
 * Passed to the LLM to declare available tools.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * A tool call requested by the LLM.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * The result of executing a tool call.
 * Returned to the LLM so it can continue reasoning.
 */
export interface ToolResult {
  toolCallId: string;
  output: unknown;
}

/**
 * Response from a tool-calling LLM interaction.
 * Extends LLMResponse with tool call details.
 */
export interface LLMToolResponse extends LLMResponse {
  /** Tool calls requested by the model (empty if model responded with text only) */
  toolCalls: ToolCall[];
  /** Text produced alongside or instead of tool calls */
  text: string;
}

/**
 * Options for chatWithTools().
 * Extends basic chat options with tool-related configuration.
 */
export interface ChatWithToolsOptions {
  maxTokens?: number;
  temperature?: number;
  /** Tools available to the LLM */
  tools?: ToolSpec[];
  /** Maximum rounds of tool call → execute → continue (default 5) */
  maxToolRounds?: number;
  /**
   * Called each time the LLM requests a tool execution.
   * If not provided, tool calls are returned without execution.
   */
  onToolCall?: (call: ToolCall) => Promise<ToolResult>;
}
