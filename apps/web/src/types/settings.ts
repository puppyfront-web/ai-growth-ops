export type AiConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  dailyTokenLimit: number;
  features: { textGeneration: boolean; leadIdentification: boolean; replySuggestion: boolean };
  lastRunAt: string | null;
};

export type SkillRun = {
  name: string;
  lastRunAt: string | null;
  status: string;
  successRate: number;
  avgLatencyMs: number;
  totalRuns: number;
};

export type ComplianceRules = {
  sensitiveWords: string[];
  forbiddenPhrases: string[];
  autoReplyLimits: { maxDailyReplies: number; confidenceThreshold: number };
  humanConfirmRules: Array<{ action: string; threshold: number }>;
};
