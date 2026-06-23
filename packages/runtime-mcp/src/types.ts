import type {
  SupervisorState,
  LoopNode,
  NodeResult,
  AutonomyLevel,
  WorkingMemory,
  PreferencesStore,
  ConfirmationGate,
  CredentialResolver
} from '@ai-growth-ops/runtime';

export type { CredentialResolver };

/** A packaged node handed to the host to execute. */
export interface NodeDirective {
  runId: string;
  node: LoopNode;
  agent: string; // AgentDefinition.name | 'supervisor'
  instructions: string; // the node's task prompt for the host LLM
  allowedTools: string[]; // domain isolation: host may only call these
  context: {
    l0: Record<string, unknown>; // WorkingMemory.all(runId) current-node snapshot
    l1: Record<string, unknown>; // preferences slice for the agent domain
  };
  gateLevel: AutonomyLevel;
  dryRun: boolean;
}

export interface RunStore {
  get(runId: string): Promise<SupervisorState | undefined>;
  set(runId: string, state: SupervisorState): Promise<void>;
}

export interface StartRunInput {
  userId: string;
  orgId: string;
  autonomyLevel?: AutonomyLevel;
  dryRun?: boolean;
}

export interface ReportInput {
  runId: string;
  result: NodeResult;
}

export type ReportOutcome =
  | { status: 'running'; directive: NodeDirective }
  | { status: 'paused'; directive: NodeDirective }
  | { status: 'completed'; review: unknown }
  | { status: 'failed'; error: string };

export interface ToolExecResult {
  output: unknown;
  blocked?: boolean;
  escalated?: boolean;
  reason?: string;
}

export interface ExecutorDeps {
  runStore: RunStore;
  gate: ConfirmationGate;
  credentials: CredentialResolver;
}

export interface OrchestratorDeps {
  runStore: RunStore;
  workingMemory: WorkingMemory;
  preferences: PreferencesStore;
}
