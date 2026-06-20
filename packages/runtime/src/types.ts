// ── Tool classification ──
export type ToolDomain = 'content' | 'publish' | 'interaction' | 'lead' | 'auth' | 'shared' | 'meta';
export type Mutate = 'Read' | 'Write';

// ── Autonomy / risk (ConfirmationGate) ──
export type AutonomyLevel = 'L1_COPILOT' | 'L2_AUTOPILOT_LIGHT' | 'L3_FULL_AUTOPILOT';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface GateInput {
  toolName: string;
  mutate: Mutate;
  input: unknown;
  risk: RiskLevel;
  /** agent self-assessed confidence 0..1 */
  confidence: number;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
}
export interface GateDecision {
  allowed: boolean;
  escalated: boolean;
  reason: string;
  /** present only when dry-run blocks with a simulated result */
  simulatedOutput?: unknown;
}
export interface ConfirmationGate {
  check(input: GateInput): GateDecision;
}

// ── Memory ──
export interface WorkingMemory {
  get(runId: string, key: string): Promise<unknown>;
  set(runId: string, key: string, value: unknown): Promise<void>;
  all(runId: string): Promise<Record<string, unknown>>;
  clear(runId: string): Promise<void>;
}

export type PreferenceDomain = 'content' | 'publish' | 'interaction' | 'lead' | 'global';

export interface UserPreferences {
  preferredPlatforms: string[];
  defaultContentType: string;
  preferredPublishTimes: string[];
  contentStylePreferences: string;
  replyStylePreferences: string;
  avoidTopics: string[];
  brandVoice: string;
}

export interface PreferencesStore {
  get(userId: string): Promise<UserPreferences>;
  set(userId: string, key: keyof UserPreferences, value: string | string[]): Promise<void>;
  forDomain(userId: string, domain: PreferenceDomain): Promise<Partial<UserPreferences>>;
}

// ── Agents ──
export interface AgentSystemPromptContext {
  userId: string;
  orgId: string;
  nodeName: string;
  preferences: Partial<UserPreferences>;
  workingMemory: Record<string, unknown>;
}

export interface AgentDefinition {
  name: string;
  domain: ToolDomain;
  description: string;
  systemPromptBuilder(ctx: AgentSystemPromptContext): string;
  /** allow-list of tool names this agent may call (exact match). */
  allowedTools: string[];
  /** optional explicit mutate override per tool name; otherwise inferred from domain. */
  mutateInference?: Record<string, Mutate>;
}

// ── Supervisor loop (first slice: INIT→METRICS→CONTENT→PUBLISH→REVIEW) ──
export type LoopNode = 'INIT' | 'METRICS' | 'CONTENT' | 'PUBLISH' | 'REVIEW';
export type NodeOutcome = 'done' | 'need_input' | 'blocked' | 'empty';

export interface NodeResult {
  node: LoopNode;
  outcome: NodeOutcome;
  output?: unknown;
  summary?: string;
  escalatedItems?: Array<{ toolName: string; input: unknown; risk: RiskLevel }>;
}

export interface SupervisorState {
  runId: string;
  userId: string;
  orgId: string;
  autonomyLevel: AutonomyLevel;
  dryRun: boolean;
  currentNode: LoopNode;
  nodeResults: Record<LoopNode, NodeResult | undefined>;
  startedAt: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
}
