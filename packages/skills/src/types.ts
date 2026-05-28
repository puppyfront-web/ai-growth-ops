export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  inputSchema: object;
  outputSchema: object;
}

export interface SkillRunResult<T = unknown> {
  runId: string;
  skillName: string;
  skillVersion: string;
  status: 'success' | 'failed';
  output?: T;
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface SkillContext {
  userId?: string;
  brandProfile?: Record<string, unknown>;
  platformRules?: Record<string, unknown>;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface SkillRunner {
  run<TInput, TOutput>(input: {
    skillName: string;
    skillVersion?: string;
    input: TInput;
    context?: SkillContext;
  }): Promise<SkillRunResult<TOutput>>;
}
