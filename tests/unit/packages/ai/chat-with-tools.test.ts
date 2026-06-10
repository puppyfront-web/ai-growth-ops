import { describe, it, expect } from 'vitest';

describe('packages/ai tool calling types', () => {
  it('should export all tool-related types', async () => {
    const ai = await import('@ai-growth-ops/ai');

    // Check that the new exports exist
    expect(typeof ai.runAgentLoop).toBe('function');
    expect(typeof ai.createLLMClient).toBe('function');
  });

  it('should create LLM client with chatWithTools method', async () => {
    const { createLLMClient } = await import('@ai-growth-ops/ai');

    // Create client (will use default env vars)
    // We don't actually call it since we don't have real API keys in tests
    const client = createLLMClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o'
    });

    expect(client).toBeDefined();
    expect(typeof client.chat).toBe('function');
    expect(typeof client.chatWithTools).toBe('function');
    expect(typeof client.getProvider).toBe('function');
    expect(typeof client.getModel).toBe('function');
    expect(client.getProvider()).toBe('openai');
    expect(client.getModel()).toBe('gpt-4o');
  });

  it('should create Anthropic client with chatWithTools', async () => {
    const { createLLMClient } = await import('@ai-growth-ops/ai');

    const client = createLLMClient({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6-20250514'
    });

    expect(client).toBeDefined();
    expect(typeof client.chatWithTools).toBe('function');
    expect(client.getProvider()).toBe('anthropic');
  });
});

describe('packages/ai agent runner', () => {
  it('should export runAgentLoop function', async () => {
    const { runAgentLoop } = await import('@ai-growth-ops/ai');
    expect(typeof runAgentLoop).toBe('function');
  });
});
