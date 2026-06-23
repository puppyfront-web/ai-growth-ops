import { apiGet, apiPatch, apiPost } from './client';

// Supervisor fixed loop order — kept in sync with the kernel (FIRST_SLICE_NODES).
export const NODE_ORDER = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'] as const;
export type NodeName = (typeof NODE_ORDER)[number];

export type RunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'paused';

export type NodeOutcome = 'done' | 'need_input' | 'blocked' | 'empty';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface EscalatedItem {
  toolName: string;
  input: unknown;
  risk: RiskLevel;
}

export interface NodeResult {
  node: NodeName;
  outcome: NodeOutcome;
  summary?: string;
  escalatedItems?: EscalatedItem[];
}

export interface AgentRun {
  id: string;
  status: RunStatus;
  currentNode: NodeName | null;
  nodeResults: Partial<Record<NodeName, NodeResult>>;
  startedAt: string | null;
  finishedAt: string | null;
  tokensUsed: number;
  dryRun: boolean;
  metadata: Record<string, unknown>;
  error: string | null;
}

export interface AgentRunSummary {
  id: string;
  status: RunStatus;
  currentNode: NodeName | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  tokensUsed: number;
  dryRun: boolean;
  escalationCount: number;
  error: string | null;
}

export function triggerAgentRun(body: {
  autonomyLevel?: 'L1_COPILOT' | 'L2_AUTOPILOT_LIGHT';
  dryRun?: boolean;
}): Promise<{ runId: string; queued: boolean }> {
  return apiPost('/api/agent/runs', body);
}

export function listAgentRuns(): Promise<{ items: AgentRunSummary[] }> {
  return apiGet('/api/agent/runs');
}

export function getAgentRun(id: string): Promise<AgentRun> {
  return apiGet(`/api/agent/runs/${id}`);
}

export function approveAndResumeRun(
  id: string
): Promise<{
  id: string;
  approvals: Array<{ node: string; toolName: string }>;
  queued: boolean;
}> {
  return apiPost(`/api/agent/runs/${id}/approve`);
}
