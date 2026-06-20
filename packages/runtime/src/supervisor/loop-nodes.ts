import type { AgentDefinition, LoopNode, NodeOutcome, NodeResult, SupervisorState } from '../types.js';
import { contentAgent, publishAgent } from '../agents/index.js';

export const FIRST_SLICE_NODES: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];

export const LEGAL_TRANSITIONS: Record<LoopNode, LoopNode | null> = {
  INIT: 'METRICS',
  METRICS: 'CONTENT',
  CONTENT: 'PUBLISH',
  PUBLISH: 'REVIEW',
  REVIEW: null
};

export const AGENT_FOR_NODE: Record<LoopNode, AgentDefinition | 'supervisor'> = {
  INIT: publishAgent,      // auth handled by publish-agent
  METRICS: contentAgent,
  CONTENT: contentAgent,
  PUBLISH: publishAgent,
  REVIEW: 'supervisor'
};

export function advance(
  state: SupervisorState,
  result: NodeResult
): { next: LoopNode | null; outcome: NodeOutcome } {
  if (result.outcome === 'done' || result.outcome === 'empty') {
    return { next: LEGAL_TRANSITIONS[state.currentNode], outcome: 'done' };
  }
  // need_input / blocked → stay, await operator
  return { next: state.currentNode, outcome: result.outcome };
}
