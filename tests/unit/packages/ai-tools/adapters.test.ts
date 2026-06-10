import { describe, it, expect } from 'vitest';

describe('Vercel AI Adapter', () => {
  it('should convert tools to Vercel format', async () => {
    const { getAllTools } = await import('@ai-growth-ops/ai-tools');
    // Import the adapter module directly using source path
    const { toVercelTools } = await import(
      '../../../../packages/ai-tools/src/adapters/vercel-ai.ts'
    );

    const tools = getAllTools();
    const ctx = {
      apiBase: 'http://localhost:3100',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
        'x-organization-id': 'test-org'
      },
      orgId: 'test-org'
    };

    const vercelTools = toVercelTools(tools, ctx);

    // Should return a record keyed by tool name
    expect(typeof vercelTools).toBe('object');
    expect(vercelTools['write_content']).toBeDefined();
    expect(vercelTools['list_accounts']).toBeDefined();
    expect(vercelTools['classify_interaction']).toBeDefined();

    // All 53 tools should be present
    expect(Object.keys(vercelTools).length).toBe(53);
  });
});

describe('Raw SDK Adapter', () => {
  it('should convert tools to raw format with JSON Schema', async () => {
    const { getAllTools } = await import('@ai-growth-ops/ai-tools');
    const { toRawTools } = await import(
      '../../../../packages/ai-tools/src/adapters/raw-sdk.ts'
    );

    const tools = getAllTools();
    const ctx = {
      apiBase: 'http://localhost:3100',
      headers: {},
      orgId: 'test-org'
    };

    const rawTools = toRawTools(tools, ctx);
    expect(rawTools.length).toBe(53);

    // Each raw tool should have the required properties
    for (const rt of rawTools) {
      expect(rt.name).toBeTruthy();
      expect(rt.description).toBeTruthy();
      expect(rt.inputSchema).toBeDefined();
      expect(typeof rt.execute).toBe('function');
    }
  });

  it('should convert to Anthropic tool format', async () => {
    const { contentTools } = await import('@ai-growth-ops/ai-tools');
    const { toRawTools, toAnthropicTools } = await import(
      '../../../../packages/ai-tools/src/adapters/raw-sdk.ts'
    );

    const ctx = {
      apiBase: 'http://localhost:3100',
      headers: {},
      orgId: 'test-org'
    };

    const rawTools = toRawTools(contentTools, ctx);
    const anthropicTools = toAnthropicTools(rawTools);

    expect(anthropicTools.length).toBe(contentTools.length);
    for (const at of anthropicTools) {
      expect(at.name).toBeTruthy();
      expect(at.description).toBeTruthy();
      expect(at.input_schema).toBeDefined();
    }
  });

  it('should convert to OpenAI tool format', async () => {
    const { contentTools } = await import('@ai-growth-ops/ai-tools');
    const { toRawTools, toOpenAITools } = await import(
      '../../../../packages/ai-tools/src/adapters/raw-sdk.ts'
    );

    const ctx = {
      apiBase: 'http://localhost:3100',
      headers: {},
      orgId: 'test-org'
    };

    const rawTools = toRawTools(contentTools, ctx);
    const openaiTools = toOpenAITools(rawTools);

    expect(openaiTools.length).toBe(contentTools.length);
    for (const ot of openaiTools) {
      expect(ot.type).toBe('function');
      expect(ot.function.name).toBeTruthy();
      expect(ot.function.description).toBeTruthy();
      expect(ot.function.parameters).toBeDefined();
    }
  });

  it('should create a tool executor for dispatching calls', async () => {
    const { contentTools } = await import('@ai-growth-ops/ai-tools');
    const { toRawTools, createToolExecutor } = await import(
      '../../../../packages/ai-tools/src/adapters/raw-sdk.ts'
    );

    const ctx = {
      apiBase: 'http://localhost:3100',
      headers: {},
      orgId: 'test-org'
    };

    const rawTools = toRawTools(contentTools, ctx);
    const executor = createToolExecutor(rawTools);

    expect(executor.has('write_content')).toBe(true);
    expect(executor.has('list_content')).toBe(true);
    expect(executor.has('non_existent')).toBe(false);
  });
});
