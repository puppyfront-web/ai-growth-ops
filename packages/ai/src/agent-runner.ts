import type {
  LLMClient,
  LLMMessage,
  LLMResponse,
  ToolSpec,
  ToolCall,
  ToolResult
} from './types.js';

export interface AgentRunConfig {
  /** The LLM client to use */
  client: LLMClient;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Initial messages (usually just the user message) */
  messages: LLMMessage[];
  /** Tools available to the agent */
  tools: ToolSpec[];
  /** Handler for tool calls requested by the LLM */
  onToolCall: (call: ToolCall) => Promise<ToolResult>;
  /** Maximum number of agent steps (default 10) */
  maxSteps?: number;
  /** Max tokens per LLM call */
  maxTokens?: number;
  /** Temperature for LLM calls */
  temperature?: number;
}

export interface AgentRunResult {
  /** All messages exchanged during the agent run */
  messages: LLMMessage[];
  /** The final text response from the agent */
  finalText: string;
  /** Number of tool calls executed */
  toolCallsExecuted: number;
  /** Aggregated token usage across all steps */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Number of agent steps completed */
  stepsCompleted: number;
  /** The final LLM response for detailed inspection */
  finalResponse: LLMResponse;
}

/**
 * Run a multi-step agent loop.
 *
 * This is the backend equivalent of the web chat's
 * `streamText({ stopWhen: stepCountIs(10) })` — it calls the LLM,
 * executes tool calls, feeds results back, and repeats until the LLM
 * produces a final text response or max steps is reached.
 */
export async function runAgentLoop(config: AgentRunConfig): Promise<AgentRunResult> {
  const maxSteps = config.maxSteps ?? 10;

  const messages: LLMMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...config.messages
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallsExecuted = 0;
  let stepsCompleted = 0;
  let finalText = '';
  let finalResponse: LLMResponse | undefined;

  for (let step = 0; step < maxSteps; step++) {
    const response = await config.client.chatWithTools(messages, {
      tools: config.tools,
      onToolCall: config.onToolCall,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      maxToolRounds: 1 // One round per step — the loop handles repetition
    });

    totalInputTokens += response.tokenUsage.inputTokens;
    totalOutputTokens += response.tokenUsage.outputTokens;
    stepsCompleted++;
    finalResponse = response;

    // Count executed tool calls
    if (response.toolCalls.length > 0) {
      toolCallsExecuted += response.toolCalls.length;

      // Append assistant response with tool calls to conversation
      const toolCallsJson = response.toolCalls
        .map(
          (tc) =>
            `[Tool Call: ${tc.name}(${JSON.stringify(tc.arguments)})]`
        )
        .join('\n');
      messages.push({
        role: 'assistant',
        content: response.text
          ? `${response.text}\n${toolCallsJson}`
          : toolCallsJson
      });

      // Append tool results
      for (const tc of response.toolCalls) {
        const result = await config.onToolCall(tc);
        messages.push({
          role: 'user',
          content: `[Tool Result for ${tc.name}]: ${
            typeof result.output === 'string'
              ? result.output
              : JSON.stringify(result.output)
          }`
        });
      }
    } else {
      // No tool calls — the agent is done
      finalText = response.text;
      messages.push({ role: 'assistant', content: response.text });
      break;
    }

    // If we're here, tool calls were executed. The chatWithTools loop
    // already handled them internally, so finalText comes from the last response.
    finalText = response.text;
  }

  if (!finalResponse) {
    throw new Error('Agent loop produced no response');
  }

  return {
    messages,
    finalText,
    toolCallsExecuted,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens
    },
    stepsCompleted,
    finalResponse
  };
}
