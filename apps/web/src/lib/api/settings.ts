import { apiGet, apiPut, apiPost, apiDelete } from './client';

export interface MediaGenerationConfig {
  mode: 'llm_provider' | 'dedicated';
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  videoMode: 'llm_provider' | 'dedicated';
  videoProvider: string;
  videoApiKey: string;
  videoBaseUrl: string;
  videoModel: string;
}

export interface AiConfig {
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  dailyTokenLimit: number;
  features: {
    textGeneration: boolean;
    leadIdentification: boolean;
    replySuggestion: boolean;
  };
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

export function updateAiConfig(
  data: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/ai', data);
}

export function getSkills(): Promise<SkillInfo[]> {
  return apiGet<SkillInfo[]>('/api/skills');
}

export function getComplianceRules(): Promise<ComplianceRules> {
  return apiGet<ComplianceRules>('/api/settings/compliance');
}

export function updateComplianceRules(
  data: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/compliance', data);
}

export function getStorageConfig(): Promise<StorageConfig> {
  return apiGet<StorageConfig>('/api/settings/storage');
}

export function updateStorageConfig(
  data: Partial<StorageConfig>
): Promise<{ ok: boolean }> {
  return apiPut<{ ok: boolean }>('/api/settings/storage', data);
}

// ── Profile ────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  organization?: { id: string; name: string };
  organizationRole?: string;
}

export function getProfile(): Promise<UserProfile> {
  return apiGet<UserProfile>('/api/user/profile');
}

export function updateProfile(data: {
  name?: string;
  email?: string;
}): Promise<UserProfile> {
  return apiPut<UserProfile>('/api/user/profile', data);
}

// ── Team（org 端点）────────────────────────────────────────────
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrgRole;
  joinedAt: string;
}

export interface InviteResult {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  emailSent: boolean;
  /** 邮件未发出时返回，供管理员手动转发 */
  acceptUrl?: string;
}

export function getOrgMembers(orgId: string): Promise<TeamMember[]> {
  return apiGet<{ members: TeamMember[] }>(
    `/api/org/${orgId}/members`
  ).then((r) => r.members);
}

export function inviteTeamMember(
  orgId: string,
  data: { email: string; role?: string }
): Promise<InviteResult> {
  return apiPost<InviteResult>(`/api/org/${orgId}/invite`, data);
}

export function updateMemberRole(
  orgId: string,
  memberId: string,
  role: OrgRole
): Promise<{ success: boolean }> {
  return apiPut(`/api/org/${orgId}/members/${memberId}/role`, { role });
}

export function removeOrgMember(
  orgId: string,
  memberId: string
): Promise<{ success: boolean }> {
  return apiDelete(`/api/org/${orgId}/members/${memberId}`);
}

// ── 邀请（公开信息，供接受邀请页使用）────────────────────────
export interface InvitationInfo {
  organizationName: string;
  inviterName: string;
  inviteeEmail: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
}

export function getInvitationInfo(token: string): Promise<InvitationInfo> {
  return apiGet<InvitationInfo>(`/api/invitations/${token}`);
}

export function acceptInvitation(
  orgId: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  return apiPost(`/api/org/${orgId}/accept-invite`, { token });
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

export function createWebhook(data: {
  url: string;
  events: string[];
}): Promise<WebhookEntry> {
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

// ── LLM Config (org-level cockpit setting; apiKey encrypted at rest) ──
export interface LlmConfigView {
  provider: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  /** True when a DB key OR a valid (non-placeholder) env key is present. */
  effectiveConfigured?: boolean;
  updatedAt: string | null;
}

export interface LlmConfigInput {
  provider: 'openai' | 'anthropic';
  /** Omit/blank to preserve the existing encrypted key. */
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export function getLlmConfig(): Promise<LlmConfigView> {
  return apiGet<LlmConfigView>('/api/settings/llm');
}

export function saveLlmConfig(body: LlmConfigInput): Promise<LlmConfigView> {
  return apiPut<LlmConfigView>('/api/settings/llm', body);
}

export interface IcpConfig {
  targetIndustries: string[];
  targetRoles: string[];
  highIntentKeywords: string[];
  excludedKeywords: string[];
}

export function getIcpConfig(): Promise<IcpConfig> {
  return apiGet<IcpConfig>('/api/settings/icp');
}

export function updateIcpConfig(data: IcpConfig): Promise<IcpConfig> {
  return apiPut<IcpConfig>('/api/settings/icp', data);
}
