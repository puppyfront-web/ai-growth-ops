import { AGENT_FOR_NODE, inferMutate, scrubSensitiveOutput } from '@ai-growth-ops/runtime';
import type { AgentDefinition } from '@ai-growth-ops/runtime';
import { getTool } from '@ai-growth-ops/ai-tools';
import type { ExecutorDeps, ToolExecResult } from './types.js';

export interface ToolExecutor {
  execute(runId: string, toolName: string, input: Record<string, unknown>): Promise<ToolExecResult>;
}

/**
 * Backend tool executor for host-mode. Enforces — independent of host cooperation:
 *   1. Domain isolation: tool must be in the active node agent's allow-list.
 *   2. Write gate: any `mutate='Write'` tool passes `ConfirmationGate.check` (dry-run
 *      blocks, L1/L2 escalate, L3 auto). Read tools skip the gate (side-effect-free)
 *      so dry-run runs can still read metrics — matches the gate's own Read-allowed intent.
 *   3. Credential injection: cookie resolved server-side from CredentialResolver,
 *      overriding/supplying whatever the host sent — cookie never lives in host context.
 *   4. Output scrub: every result passes scrubSensitiveOutput before return.
 */
export function createToolExecutor(deps: ExecutorDeps): ToolExecutor {
  return {
    async execute(runId, toolName, input): Promise<ToolExecResult> {
      const state = await deps.runStore.get(runId);
      if (!state) {
        return { output: { error: `unknown run: ${runId}` }, blocked: true, reason: 'unknown run' };
      }

      const agentOrSuper = AGENT_FOR_NODE[state.currentNode];
      if (agentOrSuper === 'supervisor') {
        return {
          output: { error: 'supervisor node has no tools' },
          blocked: true,
          escalated: false,
          reason: 'domain isolation: supervisor node allows no tools'
        };
      }
      const agent = agentOrSuper as AgentDefinition;
      if (!agent.allowedTools.includes(toolName)) {
        return {
          output: { error: `tool ${toolName} not allowed in node ${state.currentNode}` },
          blocked: true,
          escalated: false,
          reason: `domain isolation: ${toolName} not in ${state.currentNode} agent allow-list`
        };
      }

      // Strip agent self-assessment fields before they reach the tool.
      const { __risk = 'low', __confidence = 0.8, ...rest } = input as Record<string, unknown>;
      const risk = __risk as 'low' | 'medium' | 'high';
      const confidence = Number(__confidence);
      const mutate = inferMutate(toolName, agent);

      if (mutate === 'Write') {
        const decision = deps.gate.check({
          toolName,
          mutate,
          input: rest,
          risk,
          confidence,
          autonomyLevel: state.autonomyLevel,
          dryRun: state.dryRun
        });
        if (!decision.allowed) {
          return {
            output: scrubSensitiveOutput({
              blocked: true,
              escalated: decision.escalated,
              reason: decision.reason,
              simulatedOutput: decision.simulatedOutput
            }),
            blocked: true,
            escalated: decision.escalated,
            reason: decision.reason
          };
        }
      }

      // Credential injection: cookie resolved server-side, never from host context.
      let execInput = { ...rest };
      const platform = typeof rest.platform === 'string' ? rest.platform : undefined;
      if (platform) {
        const cookie = await deps.credentials.getCookie(state.userId, state.orgId, platform);
        if (cookie) execInput = { ...execInput, cookie };
      }

      const tool = getTool(toolName);
      if (!tool) {
        return { output: { error: `tool not found: ${toolName}` } };
      }
      const output = await tool.execute(execInput, {
        apiBase: '',
        headers: {},
        orgId: state.orgId,
        userId: state.userId
      });
      return { output: scrubSensitiveOutput(output) };
    }
  };
}
