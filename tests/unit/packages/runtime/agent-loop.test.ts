import { describe, it, expect } from 'vitest';
import { runDomainAgent, createConfirmationGate, createWorkingMemory } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';
import type { LLMClient, LLMToolResponse } from '@ai-growth-ops/ai';

/**
 * LLM client stub: chatWithTools always returns a final text with NO tool calls,
 * so the agent loop terminates on the first step and runDomainAgent returns
 * finalText with toolCallsExecuted: 0.
 */
function stubClient(): LLMClient {
  return {
    chat: async () => ({
      text: 'done',
      model: 'stub',
      provider: 'openai',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      latencyMs: 1
    }),
    chatWithTools: async (): Promise<LLMToolResponse> => ({
      text: 'finished node',
      model: 'stub',
      provider: 'openai',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      latencyMs: 1,
      toolCalls: []
    }),
    getProvider: () => 'openai',
    getModel: () => 'stub'
  };
}

const agent: AgentDefinition = {
  name: 'content',
  domain: 'content',
  description: 'drafts content',
  systemPromptBuilder: (ctx) => `You are content agent. node=${ctx.nodeName}`,
  allowedTools: [] // no tools -> loop ends immediately
};

describe('runDomainAgent', () => {
  it('runs to completion with no tools and returns final text', async () => {
    const result = await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'CONTENT',
      task: 'draft a douyin post',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: stubClient(),
      maxSteps: 3
    });
    expect(result.finalText).toBe('finished node');
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.escalatedItems).toEqual([]);
    expect(result.tokenUsage.totalTokens).toBe(2);
    expect(result.stepsCompleted).toBe(1);
  });
});
