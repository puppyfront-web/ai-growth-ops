import { apiGet, apiPut, apiPost, apiDelete } from './client';

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

export interface StorageConfig {
  storageType: string;
  path: string;
  maxSize: number;
  endpoint: string;
  bucket: string;
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

export function getStorageConfig(): Promise<StorageConfig> {
  return apiGet<StorageConfig>('/api/settings/storage');
}

export function updateStorageConfig(data: Partial<StorageConfig>): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/storage', data);
}

// ── Profile ────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export function getProfile(): Promise<UserProfile> {
  return apiGet<UserProfile>('/api/user/profile');
}

export function updateProfile(data: { name?: string; email?: string }): Promise<UserProfile> {
  return apiPut<UserProfile>('/api/user/profile', data);
}

// ── Team ───────────────────────────────────────────────────────
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  createdAt: string;
}

export function getTeamMembers(): Promise<TeamMember[]> {
  return apiGet<TeamMember[]>('/api/team/members');
}

export function inviteTeamMember(data: { email: string; role?: string; name?: string }): Promise<TeamMember> {
  return apiPost<TeamMember>('/api/team/invite', data);
}

export function updateMemberRole(memberId: string, role: string): Promise<TeamMember> {
  return apiPut<TeamMember>(`/api/team/members/${memberId}/role`, { role });
}

export function removeTeamMember(memberId: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/team/members/${memberId}`);
}

// ── Webhooks ───────────────────────────────────────────────────
export interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive';
  createdAt: string;
}

export function getWebhooks(): Promise<WebhookEntry[]> {
  return apiGet<WebhookEntry[]>('/api/webhooks');
}

export function createWebhook(data: { url: string; events: string[] }): Promise<WebhookEntry> {
  return apiPost<WebhookEntry>('/api/webhooks', data);
}

export function deleteWebhook(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/webhooks/${id}`);
}

// ── Reports ────────────────────────────────────────────────────
export interface GeneratedReport {
  id: string;
  type: string;
  label: string;
  summary: string;
  generatedAt: string;
  createdAt: string;
}

export function getReports(): Promise<GeneratedReport[]> {
  return apiGet<GeneratedReport[]>('/api/analytics/reports');
}

export function generateReport(type: string): Promise<GeneratedReport> {
  return apiPost<GeneratedReport>('/api/analytics/reports/generate', { type });
}
