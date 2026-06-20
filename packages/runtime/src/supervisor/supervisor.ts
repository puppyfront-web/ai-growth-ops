import type {
  AgentDefinition, AutonomyLevel, ConfirmationGate, LoopNode, NodeResult,
  PreferencesStore, SupervisorState, UserPreferences, WorkingMemory
} from '../types.js';
import { AGENT_FOR_NODE, advance } from './loop-nodes.js';

export interface RunNodeDeps {
  /** executes one node's agent; injected so tests can stub. Real impl calls runDomainAgent. */
  runNode: (
    state: SupervisorState,
    agent: AgentDefinition | 'supervisor',
    node: LoopNode
  ) => Promise<NodeResult>;
}

export interface Supervisor {
  runNode(state: SupervisorState): Promise<SupervisorState>;
}

export function createSupervisor(deps: RunNodeDeps): Supervisor {
  return {
    async runNode(state: SupervisorState): Promise<SupervisorState> {
      const node = state.currentNode;
      const agent = AGENT_FOR_NODE[node];
      const result = await deps.runNode(state, agent, node);
      const nodeResults = { ...state.nodeResults, [node]: result };
      const { next, outcome } = advance(state, result);
      let status: SupervisorState['status'] = 'running';
      if (next === null) status = 'completed';
      else if (outcome === 'need_input' || outcome === 'blocked') status = 'paused';
      return { ...state, nodeResults, currentNode: (next ?? node) as LoopNode, status };
    }
  };
}
