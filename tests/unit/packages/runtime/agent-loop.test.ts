import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  runDomainAgent,
  createConfirmationGate,
  createWorkingMemory,
  scrubSensitiveOutput
} from '@ai-growth-ops/runtime';
import type { AgentDefinition, ConfirmationGate, GateDecision, GateInput } from '@ai-growth-ops/runtime';
import type { LLMClient, LLMToolResponse, ToolCall, ToolResult } from '@ai-growth-ops/ai';
import { registerTool, clearRegistry } from '@ai-growth-ops/ai-tools';

/**
 * LLM client stub that mimics the REAL client's internal tool dispatch.
 *
 * Why this matters: `runAgentLoop` (packages/ai/src/agent-runner.ts) DOUBLE-
 * dispatches onToolCall. The real clients (openai-client.ts:166-168,
 * anthropic-client.ts) invoke `options.onToolCall!(tc)` INSIDE
 * `chatWithTools` to execute the tool and feed its result back into their
 * multi-round loop. Then runAgentLoop calls `config.onToolCall(tc)` AGAIN
 * at agent-runner.ts:105 to harvest the ToolResult for its messages array.
 *
 * A naive stub that returns `toolCalls: [...]` without invoking
 * `options.onToolCall` internally would never exercise the double dispatch
 * — which is exactly why the original stub-based test missed the bug.
 *
 * This stub mirrors openai-client.ts: it invokes onToolCall internally,
 * THEN returns the response carrying the same toolCalls, so runAgentLoop's
 * line 105 will dispatch a second time and exercise the idempotency cache.
 */
function stubClient(toolCallsToReturn: ToolCall[]): LLMClient {
  return {
    chat: async () => ({
      text: 'done',
      model: 'stub',
      provider: 'openai',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop',
      latencyMs: 1
    }),
    chatWithTools: async (
      _messages: unknown,
      options?: { onToolCall?: (call: ToolCall) => Promise<ToolResult> }
    ): Promise<LLMToolResponse> => {
      // Mimic openai-client.ts:166-168 — execute tool calls INTERNALLY
      // (this is the first dispatch). runAgentLoop will dispatch a second
      // time when it consumes the returned toolCalls.
      if (options?.onToolCall) {
        for (const tc of toolCallsToReturn) {
          await options.onToolCall(tc);
        }
      }
      return {
        text: toolCallsToReturn.length > 0 ? 'used a tool' : 'finished node',
        model: 'stub',
        provider: 'openai',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        latencyMs: 1,
        toolCalls: toolCallsToReturn
      };
    },
    getProvider: () => 'openai',
    getModel: () => 'stub'
  };
}

const FAKE_TOOL_NAME = 'test.echo_write';

/**
 * Register a fake Write tool whose `execute` is a spy. Returns the spy so
 * tests can assert call count and received input. The tool name starts
 * with 'publish.' via mutateInference override (kept out of WRITE_PREFIXES
 * so the gate logic isn't accidentally tied to the name).
 */
function registerFakeWriteTool(executeSpy: ReturnType<typeof vi.fn>) {
  registerTool({
    name: FAKE_TOOL_NAME,
    description: 'fake write tool for testing',
    inputSchema: z.object({ message: z.string() }).passthrough(),
    execute: executeSpy
  });
}

const writeAgent: AgentDefinition = {
  name: 'publish',
  domain: 'publish',
  description: 'publishes content',
  systemPromptBuilder: (ctx) => `You are publish agent. node=${ctx.nodeName}`,
  allowedTools: [FAKE_TOOL_NAME],
  mutateInference: { [FAKE_TOOL_NAME]: 'Write' as const }
};

describe('runDomainAgent', () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
    vi.restoreAllMocks();
  });

  it('runs to completion with no tools and returns final text', async () => {
    // No fake tool registered -> getToolsForAgent returns [].
    const result = await runDomainAgent({
      agent: { ...writeAgent, allowedTools: [] },
      userId: 'u',
      orgId: 'o',
      nodeName: 'CONTENT',
      task: 'draft a douyin post',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: stubClient([]),
      maxSteps: 3
    });
    expect(result.finalText).toBe('finished node');
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.escalatedItems).toEqual([]);
    expect(result.tokenUsage.totalTokens).toBe(2);
    expect(result.stepsCompleted).toBe(1);
  });

  it('allowed write (L3) executes the tool EXACTLY ONCE despite double-dispatch, increments toolCallsExecuted once, and surfaces output', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ ok: true, wrote: 'payload' });
    registerFakeWriteTool(executeSpy);

    const tc: ToolCall = {
      id: 'call_1',
      name: FAKE_TOOL_NAME,
      arguments: { message: 'hello', __risk: 'low', __confidence: 0.9 }
    };

    const result = await runDomainAgent({
      agent: writeAgent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish a post',
      autonomyLevel: 'L3_FULL_AUTOPILOT', // writes auto-allowed
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: stubClient([tc]),
      maxSteps: 3
    });

    // Regression guard: WITHOUT the cache this would be 2.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(result.toolCallsExecuted).toBe(1);
    // __risk / __confidence must be stripped before reaching execute.
    expect(executeSpy.mock.calls[0][0]).toEqual({ message: 'hello' });
    expect(result.escalatedItems).toEqual([]);
  });

  it('blocked write (L1) does NOT execute the tool, records one escalated item, and ToolResult output is {blocked:true}', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ shouldNotReach: true });
    registerFakeWriteTool(executeSpy);

    let capturedToolResult: ToolResult | undefined;
    // Wrap the gate to capture the ToolResult that onToolCall returns so we
    // can assert its output shape. We do this by intercepting at the
    // gate level via a thin proxy.
    const innerGate = createConfirmationGate();
    const recordingGate: ConfirmationGate = {
      check: (input: GateInput): GateDecision => innerGate.check(input)
    };

    const tc: ToolCall = {
      id: 'call_block',
      name: FAKE_TOOL_NAME,
      arguments: { message: 'blocked write' } // L1 -> escalated regardless
    };

    // Use a custom client that captures the ToolResult returned by the
    // first (internal) dispatch.
    const captureClient: LLMClient = {
      ...stubClient([tc]),
      chatWithTools: async (
        _m: unknown,
        options?: { onToolCall?: (call: ToolCall) => Promise<ToolResult> }
      ): Promise<LLMToolResponse> => {
        if (options?.onToolCall) {
          for (const c of [tc]) {
            capturedToolResult = await options.onToolCall(c);
          }
        }
        return {
          text: 'blocked tool',
          model: 'stub',
          provider: 'openai',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          finishReason: 'stop',
          latencyMs: 1,
          toolCalls: [tc]
        };
      }
    };

    const result = await runDomainAgent({
      agent: writeAgent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish a post',
      autonomyLevel: 'L1_COPILOT', // writes blocked + escalated
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: recordingGate,
      llmClient: captureClient,
      maxSteps: 3
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.escalatedItems).toHaveLength(1);
    expect(result.escalatedItems[0]).toEqual({
      toolName: FAKE_TOOL_NAME,
      input: { message: 'blocked write' },
      risk: 'low'
    });
    // The ToolResult fed back to the LLM must signal a block.
    expect(capturedToolResult?.output).toMatchObject({
      blocked: true,
      escalated: true
    });
  });

  it('dry-run block is NOT recorded as escalated (escalatedItems stays empty) even though execute is not called', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ shouldNotReach: true });
    registerFakeWriteTool(executeSpy);

    const tc: ToolCall = {
      id: 'call_dryrun',
      name: FAKE_TOOL_NAME,
      arguments: { message: 'dry-run attempt' }
    };

    const result = await runDomainAgent({
      agent: writeAgent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish a post',
      autonomyLevel: 'L3_FULL_AUTOPILOT', // would normally be allowed
      dryRun: true, // but dry-run short-circuits to blocked + NOT escalated
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: stubClient([tc]),
      maxSteps: 3
    });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.escalatedItems).toEqual([]);
  });

  it('strips __risk/__confidence from the input reaching execute AND forwards them to gate.check', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ ok: true });
    registerFakeWriteTool(executeSpy);

    // Spy on gate.check to capture what was forwarded.
    const seenByGate: GateInput[] = [];
    const spyGate: ConfirmationGate = {
      check: (input: GateInput): GateDecision => {
        seenByGate.push(input);
        // Force-allow so execute runs and we can inspect its received input.
        return { allowed: true, escalated: false, reason: 'forced allow' };
      }
    };

    const tc: ToolCall = {
      id: 'call_risk',
      name: FAKE_TOOL_NAME,
      arguments: { message: 'risky write', __risk: 'high', __confidence: 0.3 }
    };

    const result = await runDomainAgent({
      agent: writeAgent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish a post',
      autonomyLevel: 'L3_FULL_AUTOPILOT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: spyGate,
      llmClient: stubClient([tc]),
      maxSteps: 3
    });

    // gate.check saw exactly one invocation (cache prevents a second push).
    expect(seenByGate).toHaveLength(1);
    expect(seenByGate[0].risk).toBe('high');
    expect(seenByGate[0].confidence).toBe(0.3);
    // The LLM self-assessment keys did NOT leak into the input that
    // reaches tool.execute.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0]).toEqual({ message: 'risky write' });
    expect(executeSpy.mock.calls[0][0]).not.toHaveProperty('__risk');
    expect(executeSpy.mock.calls[0][0]).not.toHaveProperty('__confidence');
    expect(result.toolCallsExecuted).toBe(1);
  });
});

describe('scrubSensitiveOutput (M2)', () => {
  it('redacts values of sensitive keys at the top level', () => {
    const out = scrubSensitiveOutput({
      cookies: 'abc123',
      loggedIn: true,
      user: 'alice'
    });
    expect(out).toEqual({
      cookies: '[redacted]',
      loggedIn: true,
      user: 'alice'
    });
  });

  it('matches token/password/secret/authorization/apikey case-insensitively', () => {
    const out = scrubSensitiveOutput({
      Token: 't',
      PASSWORD: 'p',
      ApiKey: 'k',
      authorization: 'Bearer xyz',
      sessionSecret: 's',
      visible: 1
    });
    expect(out).toEqual({
      Token: '[redacted]',
      PASSWORD: '[redacted]',
      ApiKey: '[redacted]',
      authorization: '[redacted]',
      sessionSecret: '[redacted]',
      visible: 1
    });
  });

  it('recurses into nested objects and arrays', () => {
    const out = scrubSensitiveOutput({
      meta: { cookie: 'c', ok: true },
      list: [{ token: 't1' }, { keep: 'k' }],
      primitive: 42
    });
    expect(out).toEqual({
      meta: { cookie: '[redacted]', ok: true },
      list: [{ token: '[redacted]' }, { keep: 'k' }],
      primitive: 42
    });
  });

  it('returns primitives and null as-is', () => {
    expect(scrubSensitiveOutput('hello')).toBe('hello');
    expect(scrubSensitiveOutput(7)).toBe(7);
    expect(scrubSensitiveOutput(null)).toBeNull();
    expect(scrubSensitiveOutput(undefined)).toBeUndefined();
  });

  it('does not mutate the input (returns a new structure for plain objects)', () => {
    const input = { cookies: 'abc', x: 1 };
    const out = scrubSensitiveOutput(input);
    expect(out).not.toBe(input);
    expect(input.cookies).toBe('abc'); // untouched
    expect(out.cookies).toBe('[redacted]');
  });
});

describe('runDomainAgent output scrubbing (M2 integration)', () => {
  beforeEach(() => {
    clearRegistry();
  });
  afterEach(() => {
    clearRegistry();
    vi.restoreAllMocks();
  });

  it('scrubs sensitive keys from the ToolResult.output passed back to the LLM (allowed-execution path)', async () => {
    // A fake tool that returns a payload mimicking auth.login — raw cookies.
    const leakingTool = vi.fn().mockResolvedValue({
      cookies: 'session=abc123; path=/',
      loggedIn: true,
      userId: 'u-42'
    });
    registerTool({
      name: 'auth.login',
      description: 'logs in and returns cookies',
      inputSchema: z.object({ username: z.string() }).passthrough(),
      execute: leakingTool
    });

    // Capture the ToolResult returned by onToolCall to assert what the LLM sees.
    let captured: ToolResult | undefined;
    const captureClient: LLMClient = {
      ...stubClient([
        { id: 'call_leak', name: 'auth.login', arguments: { username: 'alice' } }
      ]),
      chatWithTools: async (
        _m: unknown,
        options?: { onToolCall?: (call: ToolCall) => Promise<ToolResult> }
      ): Promise<LLMToolResponse> => {
        if (options?.onToolCall) {
          for (const c of [
            { id: 'call_leak', name: 'auth.login', arguments: { username: 'alice' } }
          ]) {
            captured = await options.onToolCall(c);
          }
        }
        return {
          text: 'logged in',
          model: 'stub',
          provider: 'openai',
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          finishReason: 'stop',
          latencyMs: 1,
          toolCalls: []
        };
      }
    };

    const leakingAgent: AgentDefinition = {
      name: 'auth',
      domain: 'publish',
      description: 'auth',
      systemPromptBuilder: (ctx) => `auth agent node=${ctx.nodeName}`,
      allowedTools: ['auth.login'],
      mutateInference: { 'auth.login': 'Write' as const }
    };

    await runDomainAgent({
      agent: leakingAgent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'INIT',
      task: 'login',
      autonomyLevel: 'L3_FULL_AUTOPILOT', // writes auto-allowed
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: captureClient,
      maxSteps: 3
    });

    expect(leakingTool).toHaveBeenCalledTimes(1);
    // The ToolResult fed back to the LLM must have cookies redacted but
    // non-sensitive values preserved.
    expect(captured?.output).toMatchObject({
      cookies: '[redacted]',
      loggedIn: true,
      userId: 'u-42'
    });
  });
});
