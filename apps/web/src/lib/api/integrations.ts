import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface PlatformCapability {
  id: string;
  capabilityKey: string;
  mode: string;
  enabled: boolean;
  limits?: Record<string, unknown>;
}

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: string;
  name: string;
  mode: string;
  status: string;
  authType?: string | null;
  accessTokenEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  cookieRef?: string | null;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  platformCapabilities?: PlatformCapability[];
  lastHealthCheckAt?: string | null;
  expiresAt?: string | null;
  [key: string]: unknown;
}

export interface ProviderInfo {
  name: string;
  operation: string;
  runCount: number;
  avgDurationMs: number;
}

export function getPlatformAccounts(): Promise<PlatformAccount[]> {
  return apiGet<PlatformAccount[]>('/api/accounts');
}

export function updatePlatformAccount(id: string, data: Record<string, unknown>): Promise<PlatformAccount> {
  return apiPut<PlatformAccount>(`/api/accounts/${id}`, data);
}

export function createPlatformAccount(data: Record<string, unknown>): Promise<PlatformAccount> {
  return apiPost<PlatformAccount>('/api/accounts', data);
}

export function validatePlatformAccount(id: string): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(`/api/accounts/${id}/validate`, {});
}

export function deletePlatformAccount(id: string): Promise<void> {
  return apiDelete<void>(`/api/accounts/${id}`);
}

export interface BrowserLoginStartResponse {
  sessionId: string;
  status: 'waiting_scan';
}

export interface BrowserLoginStatusResponse {
  status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
  cookies?: string;
  error?: string;
}

export function startBrowserLogin(accountId: string): Promise<BrowserLoginStartResponse> {
  return apiPost<BrowserLoginStartResponse>(`/api/accounts/${accountId}/browser-login/start`, {});
}

export function getBrowserLoginStatus(accountId: string): Promise<BrowserLoginStatusResponse> {
  return apiGet<BrowserLoginStatusResponse>(`/api/accounts/${accountId}/browser-login/status`);
}

export function cancelBrowserLogin(accountId: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(`/api/accounts/${accountId}/browser-login/cancel`, {});
}

export function getProviders(): Promise<ProviderInfo[]> {
  return apiGet<ProviderInfo[]>('/api/providers');
}

export function getFeishuConfig(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/lead-sinks/feishu');
}

export function updateFeishuConfig(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>('/api/lead-sinks/feishu', data);
}

export function getWecomConfig(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/lead-sinks/wecom');
}

export function updateWecomConfig(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>('/api/lead-sinks/wecom', data);
}
