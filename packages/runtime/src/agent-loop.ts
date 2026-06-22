import { runAgentLoop, createLLMClient } from '@ai-growth-ops/ai';
import type { LLMClient, LLMMessage, ToolSpec, ToolCall, ToolResult } from '@ai-growth-ops/ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getTool, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { getToolsForAgent, inferMutate } from './tool-access.js';
import type {
  AgentDefinition,
  AgentSystemPromptContext,
  AutonomyLevel,
  ConfirmationGate,
  RiskLevel,
  UserPreferences,
  WorkingMemory
} from './types.js';

export interface RunDomainAgentParams {
  agent: AgentDefinition;
  userId: string;
  orgId: string;
  nodeName: string;
  /** user message describing the node's goal */
  task: string;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  workingMemory: WorkingMemory;
  preferences: Partial<UserPreferences>;
  confirmationGate: ConfirmationGate;
  /** injected for testing; defaults to createLLMClient() */
  llmClient?: LLMClient;
  /** default 8 */
  maxSteps?: number;
}

export interface DomainAgentResult {
  finalText: string;
  toolCallsExecuted: number;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  stepsCompleted: number;
  escalatedItems: Array<{ toolName: string; input: unknown; risk: RiskLevel }>;
}

/** Strip the `$schema` keyword and convert a Zod schema into a clean JSON Schema for ToolSpec. */
function toToolSpec(tools: ToolDefinition[]): ToolSpec[] {
  return tools.map((t) => {
    const schema = zodToJsonSchema(t.inputSchema, { target: 'openApi3' }) as Record<string, unknown>;
    // strip the `$schema` meta-key — providers reject it inside inputSchema.
    if ('$schema' in schema) delete schema.$schema;
    return { name: t.name, description: t.description, inputSchema: schema };
  });
}

const SENSITIVE_KEY_RE = /cookie|token|password|secret|authorization|apikey/i;

/**
 * Scrub sensitive values from a tool output BEFORE it is returned as a
 * ToolResult and fed back into the LLM message stream. Replaces the value
 * of any object key matching `SENSITIVE_KEY_RE` with `'[redacted]'`.
 *
 * Why: `runAgentLoop` feeds each `ToolResult.output` back to the LLM as a
 * message; tools like `auth.login` return raw `cookies`, which must never
 * leak into the model's context. Scrubbing affects ONLY what the LLM sees —
 * the raw tool execution (and any persistence it did) has already happened
 * by the time this runs. `escalatedItems[].input` (not output) is left
 * untouched.
 *
 * Non-object / null / undefined values are returned as-is (nothing to scan).
 * Recurses into plain object values and arrays of plain objects. Does not
 * clone class instances other than plain `{}` / `[]`.
 */
export function scrubSensitiveOutput<T>(output: T): T {
  return scrubImpl(output) as T;
}

function scrubImpl(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(scrubImpl);
  }
  // Only scrub plain objects (and plain-object-like). Skip class instances
  // that may carry methods, to avoid surprise re-shaping.
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[redacted]' : scrubImpl(v);
  }
  return out;
}

/**
 * Convert a domain agent (Task 7) into a gated `runAgentLoop` invocation.
 *
 * Security-critical invariants:
 *  - `__risk` / `__confidence` (LLM self-assessment) are extracted from the call
 *    arguments and STRIPPED from the input that reaches the tool's `execute`.
 *  - Every tool call goes through the ConfirmationGate before execution.
 *  - Blocked calls are returned as `{blocked:true,...}` ToolResults without
 *    executing the tool or incrementing `toolCallsExecuted`.
 *  - Escalated blocks (decision.escalated === true) are recorded in
 *    `escalatedItems`; plain dry-run blocks are NOT (they are not escalations).
 */
export async function runDomainAgent(params: RunDomainAgentParams): Promise<DomainAgentResult> {
  const client = params.llmClient ?? createLLMClient();
  const visibleTools = getToolsForAgent(params.agent);
  const tools = toToolSpec(visibleTools);
  const escalatedItems: DomainAgentResult['escalatedItems'] = [];
  let toolCallsExecuted = 0;

  // Idempotency cache keyed by ToolCall.id. The upstream `runAgentLoop`
  // (packages/ai/src/agent-runner.ts) double-dispatches `onToolCall`: the
  // real LLM clients execute the call inside `chatWithTools` via the
  // `onToolCall` passed at agent-runner.ts:74, AND runAgentLoop calls
  // `config.onToolCall(tc)` again at agent-runner.ts:105 to harvest the
  // ToolResult for its messages array. Without this cache, every call
  // would execute the tool twice (publish twice!), double
  // `toolCallsExecuted`, and duplicate `escalatedItems`. The cache makes
  // the second invocation return the same ToolResult without re-execution,
  // re-counting, or re-escalation. Pre-existing packages/ai bug, noted
  // for a separate fix.
  const toolCallCache = new Map<string, ToolResult>();

  // Working memory is keyed by scope; nodeName is the per-node scope available
  // in this layer (Task 9's worker will pass the supervisor run's nodeName).
  const memorySnapshot = await params.workingMemory.all(params.nodeName);
  const ctx: AgentSystemPromptContext = {
    userId: params.userId,
    orgId: params.orgId,
    nodeName: params.nodeName,
    preferences: params.preferences,
    workingMemory: memorySnapshot
  };
  const systemPrompt = params.agent.systemPromptBuilder(ctx);
  const messages: LLMMessage[] = [{ role: 'user', content: params.task }];

  const onToolCall = async (call: ToolCall): Promise<ToolResult> => {
    // Idempotency: if this exact call has been served before (because
    // runAgentLoop double-dispatches), return the cached ToolResult without
    // re-executing the tool, re-incrementing toolCallsExecuted, or
    // re-pushing to escalatedItems.
    const cached = toolCallCache.get(call.id);
    if (cached) return cached;

    const { __risk = 'low', __confidence = 0.8, ...input } = (call.arguments ?? {}) as Record<string, unknown>;
    const risk = __risk as RiskLevel;
    const confidence = Number(__confidence);
    const mutate = inferMutate(call.name, params.agent);

    const decision = params.confirmationGate.check({
      toolName: call.name,
      mutate,
      input,
      risk,
      confidence,
      autonomyLevel: params.autonomyLevel,
      dryRun: params.dryRun
    });

    let result: ToolResult;
    if (!decision.allowed) {
      // Escalated (autonomy-tier rejection) items are surfaced to the caller;
      // plain dry-run simulations are returned as blocked ToolResults but not
      // recorded as escalations.
      if (decision.escalated) {
        escalatedItems.push({ toolName: call.name, input, risk });
      }
      result = {
        toolCallId: call.id,
        // Scrub sensitive keys consistently on BOTH paths so a tool that
        // echoes its input (e.g. auth.login under dry-run reflecting the
        // attempted credentials back via simulatedOutput) cannot leak
        // cookies/tokens/secrets into the LLM message stream.
        output: scrubSensitiveOutput({
          blocked: true,
          escalated: decision.escalated,
          reason: decision.reason,
          simulatedOutput: decision.simulatedOutput
        })
      };
    } else {
      const tool = getTool(call.name);
      if (!tool) {
        result = { toolCallId: call.id, output: { error: `tool not found: ${call.name}` } };
      } else {
        toolCallsExecuted++;
        const output = await tool.execute(input, {
          apiBase: '',
          headers: {},
          orgId: params.orgId,
          userId: params.userId
        });
        result = { toolCallId: call.id, output: scrubSensitiveOutput(output) };
      }
    }

    toolCallCache.set(call.id, result);
    return result;
  };

  const agentResult = await runAgentLoop({
    client,
    systemPrompt,
    messages,
    tools,
    onToolCall,
    maxSteps: params.maxSteps ?? 8
  });

  return {
    finalText: agentResult.finalText,
    toolCallsExecuted,
    tokenUsage: agentResult.tokenUsage,
    stepsCompleted: agentResult.stepsCompleted,
    escalatedItems
  };
}
