import { apiGet, apiPut } from './client';

export interface MediaGenerationConfig {
  mode: 'llm_provider' | 'dedicated';
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiConfig {
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  dailyTokenLimit: number;
  features: { textGeneration: boolean; leadIdentification: boolean; replySuggestion: boolean };
  lastRunAt: string | null;
  mediaGeneration: MediaGenerationConfig;
}

export interface SkillInfo {
  name: string;
  lastRunAt: string | null;
  status: string;
  successRate: number;
  avgLatencyMs: number;
  totalRuns: number;
}

export interface ComplianceRules {
  sensitiveWords: string[];
  forbiddenPhrases: string[];
  autoReplyLimits: { maxDailyReplies: number; confidenceThreshold: number };
  humanConfirmRules: Array<{ action: string; threshold: number }>;
}

export function getAiConfig(): Promise<AiConfig> {
  return apiGet<AiConfig>('/api/settings/ai');
}

export function updateAiConfig(data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/ai', data);
}

export function getSkills(): Promise<SkillInfo[]> {
  return apiGet<SkillInfo[]>('/api/skills');
}

export function getComplianceRules(): Promise<ComplianceRules> {
  return apiGet<ComplianceRules>('/api/settings/compliance');
}

export function updateComplianceRules(data: Record<string, unknown>): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/compliance', data);
}
