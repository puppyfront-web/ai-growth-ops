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
  status: 'waiting_scan';
  /** 登录页二维码截图（data URL），由 browser-runner 无头渲染 */
  qrImage?: string;
}

export interface BrowserLoginStatusResponse {
  status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
  cookies?: string;
  qrImage?: string;
  /** 整页实时画面（JPEG data URL，640×450），供操作员远程处理滑块/验证码 */
  pageImage?: string;
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

/** 远程交互参数：click 传 x/y；drag 传 from/to；type 传 text；key 传 key */
export type BrowserLoginInteraction =
  | { action: 'click'; x: number; y: number }
  | { action: 'drag'; fromX: number; fromY: number; toX: number; toY: number }
  | { action: 'type'; text: string }
  | { action: 'key'; key: string };

export function interactWithBrowserLogin(
  accountId: string,
  interaction: BrowserLoginInteraction
): Promise<{ ok: boolean; error?: string }> {
  return apiPost<{ ok: boolean; error?: string }>(
    `/api/accounts/${accountId}/browser-login/interact`,
    interaction
  );
}

/** 实时画面流的短时票据（EventSource 无法携带 Authorization 头） */
export function getScreencastTicket(accountId: string): Promise<{
  ticket: string;
}> {
  return apiPost<{ ticket: string }>(
    `/api/accounts/${accountId}/browser-login/screencast-ticket`,
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
