import { describe, it, expect, beforeEach } from 'vitest';
import { clearRegistry, registerToolGroup, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import {
  runDomainAgent,
  createConfirmationGate,
  createWorkingMemory,
  type AgentDefinition,
  type CredentialResolver,
  type LLMClient
} from '@ai-growth-ops/runtime';
import { z } from 'zod';

// Spy tool records every input it receives so we can assert what reached execute.
const seenInputs: Array<Record<string, unknown>> = [];
const spyTool: ToolDefinition = {
  name: 'content.list_videos',
  description: 'spy',
  inputSchema: z.object({ platform: z.string(), cookie: z.string().optional() }),
  execute: async (args: Record<string, unknown>) => {
    seenInputs.push(args);
    return { ok: true };
  }
};

const agent: AgentDefinition = {
  name: 'content',
  domain: 'content',
  description: 'spy agent',
  allowedTools: ['content.list_videos'],
  systemPromptBuilder: () => 'sys'
};

// Stub LLM: first step requests the tool (no cookie in args), second step ends.
function makeStubLlm(): LLMClient {
  let step = 0;
  return {
    chatWithTools: async () => {
      step += 1;
      if (step === 1) {
        return {
          text: '',
          toolCalls: [{ id: 'c1', name: 'content.list_videos', arguments: { platform: 'douyin' } }],
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
        } as never;
      }
      return { text: 'done', toolCalls: [], tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } as never;
    }
  } as never;
}

beforeEach(() => {
  seenInputs.length = 0;
  clearRegistry();
  registerToolGroup({ name: 'spy', tools: [spyTool] });
});

describe('runDomainAgent credential injection', () => {
  it('injects cookie server-side from the CredentialResolver before execute', async () => {
    const resolver: CredentialResolver = { getCookie: async () => 'server-cookie' };
    await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'METRICS',
      task: 'list videos',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm(),
      credentials: resolver
    });
    expect(seenInputs).toHaveLength(1);
    expect(seenInputs[0].cookie).toBe('server-cookie'); // injected server-side
    expect(seenInputs[0].platform).toBe('douyin');
  });

  it('passes resolver userId/orgId through', async () => {
    const seen: string[] = [];
    const resolver: CredentialResolver = {
      getCookie: async (userId, orgId) => {
        seen.push(`${userId}/${orgId}`);
        return 'c';
      }
    };
    await runDomainAgent({
      agent,
      userId: 'user-1',
      orgId: 'org-1',
      nodeName: 'METRICS',
      task: 'list',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm(),
      credentials: resolver
    });
    expect(seen).toEqual(['user-1/org-1']);
  });

  it('does not inject when no credentials provided (backward compatible)', async () => {
    await runDomainAgent({
      agent,
      userId: 'u',
      orgId: 'o',
      nodeName: 'METRICS',
      task: 'list',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false,
      workingMemory: createWorkingMemory(),
      preferences: {},
      confirmationGate: createConfirmationGate(),
      llmClient: makeStubLlm()
      // no credentials
    });
    expect(seenInputs).toHaveLength(1);
    expect(seenInputs[0].cookie).toBeUndefined();
  });
});
