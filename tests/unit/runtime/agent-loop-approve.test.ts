import { describe, it, expect, beforeEach } from 'vitest';
import { clearRegistry, registerToolGroup, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import {
  runDomainAgent,
  createConfirmationGate,
  createWorkingMemory,
  type AgentDefinition,
  type LLMClient
} from '@ai-growth-ops/runtime';
import { z } from 'zod';

// A WRITE tool (publish.* prefix → inferMutate 'Write'). Under L2 with high
// risk the gate escalates (blocks) it — the exact case auto-resume must unlock.
const seen: Array<Record<string, unknown>> = [];
const writeTool: ToolDefinition = {
  name: 'publish.video',
  description: 'publish a video',
  inputSchema: z.object({ platform: z.string(), title: z.string() }),
  execute: async (args: Record<string, unknown>) => {
    seen.push(args);
    return { ok: true, published: true };
  }
};

const agent: AgentDefinition = {
  name: 'publish',
  domain: 'publish',
  description: 'publish agent',
  allowedTools: ['publish.video'],
  systemPromptBuilder: () => 'sys'
};

// Step 1: request the write tool at HIGH risk (→ L2 escalates). Step 2: done.
function makeStubLlm(): LLMClient {
  let step = 0;
  return {
    chatWithTools: async () => {
      step += 1;
      if (step === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: `c${step}`,
              name: 'publish.video',
              arguments: { platform: 'douyin', title: 't', __risk: 'high', __confidence: 0.9 }
            }
          ],
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
        } as never;
      }
      return { text: 'published', toolCalls: [], tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } as never;
    }
  } as never;
}

beforeEach(() => {
  seen.length = 0;
  clearRegistry();
  registerToolGroup({ name: 'pub', tools: [writeTool] });
});

describe('runDomainAgent approvedTools (auto-resume)', () => {
  it('without approval: high-risk write is escalated and NOT executed', async () => {
    const result = await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm()
    });
    expect(result.escalatedItems.map((e) => e.toolName)).toEqual(['publish.video']);
    expect(seen).toHaveLength(0); // never executed
  });

  it('with approval: same high-risk write is executed and not escalated', async () => {
    const result = await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm(),
      approvedTools: new Set(['publish.video'])
    });
    expect(result.escalatedItems).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0].platform).toBe('douyin');
  });

  it('approval NEVER overrides dry-run (defensive)', async () => {
    const result = await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'PUBLISH',
      task: 'publish',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: true,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm(),
      approvedTools: new Set(['publish.video'])
    });
    // Dry-run simulates, never executes, even with approval.
    expect(seen).toHaveLength(0);
    expect(result.escalatedItems).toEqual([]); // dry-run blocks are not escalations
  });
});
