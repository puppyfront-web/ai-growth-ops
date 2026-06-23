import {
  AGENT_FOR_NODE,
  type SupervisorState,
  type AgentDefinition,
  type PreferenceDomain,
  type AgentSystemPromptContext
} from '@ai-growth-ops/runtime';
import type { NodeDirective } from './types.js';

const NODE_AGENT_DOMAIN_TO_PREF: Record<string, PreferenceDomain> = {
  content: 'content',
  publish: 'publish',
  auth: 'publish',
  interaction: 'interaction',
  lead: 'lead',
  shared: 'global',
  meta: 'global'
};

const REVIEW_INSTRUCTIONS = `You are the supervisor at the REVIEW node. Build a concise daily review:
summarize what was attempted and the outcome of each prior node (INIT/METRICS/CONTENT/PUBLISH),
flag any escalated items that need the operator, and recommend tomorrow's priorities.
Return a NodeResult with outcome='done' and a 'summary' string.`;

export async function buildNodeDirective(
  state: SupervisorState,
  deps: { workingMemory: import('@ai-growth-ops/runtime').WorkingMemory; preferences: import('@ai-growth-ops/runtime').PreferencesStore }
): Promise<NodeDirective> {
  const agentOrSuper = AGENT_FOR_NODE[state.currentNode];

  if (agentOrSuper === 'supervisor') {
    const l0 = await deps.workingMemory.all(state.currentNode);
    return {
      runId: state.runId,
      node: state.currentNode,
      agent: 'supervisor',
      instructions: REVIEW_INSTRUCTIONS,
      allowedTools: [],
      context: { l0, l1: {} },
      gateLevel: state.autonomyLevel,
      dryRun: state.dryRun
    };
  }

  const agent = agentOrSuper as AgentDefinition;
  const prefDomain = NODE_AGENT_DOMAIN_TO_PREF[agent.domain] ?? 'global';
  const preferences = await deps.preferences.forDomain(state.userId, prefDomain);
  const l0 = await deps.workingMemory.all(state.currentNode);
  const ctx: AgentSystemPromptContext = {
    userId: state.userId,
    orgId: state.orgId,
    nodeName: state.currentNode,
    preferences,
    workingMemory: l0
  };
  const instructions = agent.systemPromptBuilder(ctx);

  return {
    runId: state.runId,
    node: state.currentNode,
    agent: agent.name,
    instructions,
    allowedTools: [...agent.allowedTools],
    context: { l0, l1: preferences as Record<string, unknown> },
    gateLevel: state.autonomyLevel,
    dryRun: state.dryRun
  };
}
