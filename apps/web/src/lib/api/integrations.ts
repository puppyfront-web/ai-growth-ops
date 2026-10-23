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
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasCookie: boolean;
  hasSecretConfig: boolean;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  platformCapabilities?: PlatformCapability[];
  lastHealthCheckAt?: string | null;
  expiresAt?: string | null;
  [key: string]: unknown;
}

export function getPlatformAccounts(): Promise<PlatformAccount[]> {
  return apiGet<PlatformAccount[]>('/api/accounts');
}

export function updatePlatformAccount(
  id: string,
  data: Record<string, unknown>
): Promise<PlatformAccount> {
  return apiPut<PlatformAccount>(`/api/accounts/${id}`, data);
}

export function createPlatformAccount(
  data: Record<string, unknown>
): Promise<PlatformAccount> {
  return apiPost<PlatformAccount>('/api/accounts', data);
}

export function validatePlatformAccount(
  id: string
): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(`/api/accounts/${id}/validate`, {});
}

export function deletePlatformAccount(id: string): Promise<void> {
  return apiDelete<void>(`/api/accounts/${id}`);
}

export interface BrowserLoginStartResponse {
  sessionId: string;
  status: 'waiting_local_bridge';
  expiresAt: string;
  launchUrl: string;
  installerUrl?: string;
  loginUrl?: string;
}

export interface BrowserLoginStatusResponse {
  status:
    | 'waiting_local_bridge'
    | 'waiting_user'
    | 'logged_in'
    | 'cancelled'
    | 'expired'
    | 'error';
  expiresAt?: string;
  error?: string;
}

export function startBrowserLogin(
  accountId: string
): Promise<BrowserLoginStartResponse> {
  return apiPost<BrowserLoginStartResponse>(
    `/api/accounts/${accountId}/browser-login/start`,
    {}
  );
}

export function getBrowserLoginStatus(
  accountId: string
): Promise<BrowserLoginStatusResponse> {
  return apiGet<BrowserLoginStatusResponse>(
    `/api/accounts/${accountId}/browser-login/status`
  );
}

export function cancelBrowserLogin(
  accountId: string
): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(
    `/api/accounts/${accountId}/browser-login/cancel`,
    {}
  );
}

// ── 网页内扫码登录（第 1 代交互，部署到用户机器时的默认方式）──

export interface QrLoginStartResponse {
  sessionId: string;
  status: 'waiting_scan';
  /** true = 已弹出真实浏览器窗口展示完整登录页；false = 无头模式，弹窗展示二维码 */
  headed?: boolean;
  qrImage?: string;
}

export interface QrLoginStatusResponse {
  status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
  qrImage?: string;
  pageImage?: string;
  error?: string;
}

export function startQrLogin(
  accountId: string
): Promise<QrLoginStartResponse> {
  return apiPost<QrLoginStartResponse>(
    `/api/accounts/${accountId}/qr-login/start`,
    {}
  );
}

export function getQrLoginStatus(
  accountId: string
): Promise<QrLoginStatusResponse> {
  return apiGet<QrLoginStatusResponse>(
    `/api/accounts/${accountId}/qr-login/status`
  );
}

export function cancelQrLogin(accountId: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>(
    `/api/accounts/${accountId}/qr-login/cancel`,
    {}
  );
}

export function getFeishuConfig(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/lead-sinks/feishu');
}

export function updateFeishuConfig(
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>('/api/lead-sinks/feishu', data);
}

export function testFeishuConfig(
  data: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>(
    '/api/lead-sinks/feishu/test',
    data
  );
}

export function getWecomConfig(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>('/api/lead-sinks/wecom');
}

export function updateWecomConfig(
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return apiPut<Record<string, unknown>>('/api/lead-sinks/wecom', data);
}
