/**
 * Platform auth-expiry contract shared by api / worker / web.
 *
 * When a social platform session (cookie or token) is no longer valid, the
 * canonical flow is:
 *   1. whichever layer detects it (provider health check, worker sync job)
 *      flags the PlatformAccount as status='expired'
 *   2. the web app reacts by guiding the user straight into the
 *      browser-login (QR authorization) dialog for that account
 *   3. a successful re-scan flips the account back to status='active'
 */
export const PLATFORM_AUTH_EXPIRED_CODE = 'AUTH_EXPIRED';

/**
 * Error messages that mean "the stored platform session is gone / never
 * existed — the user must re-authorize". Matched against provider
 * HealthCheckResult.error texts and connector/worker exception messages.
 */
const AUTH_EXPIRED_MARKERS = [
  '重定向到登录页',
  'Cookie 已失效',
  'Cookie 已过期',
  'Token 已过期',
  '登录已失效',
  '缺少 Access Token 或 Cookie',
  '缺少 Cookie',
  '缺少 AppID/AppSecret 或 Cookie',
  'AUTH_EXPIRED'
] as const;

export function isPlatformAuthExpiredError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String((err as { message?: unknown })?.message ?? '');
  if (!message) return false;
  return AUTH_EXPIRED_MARKERS.some((marker) => message.includes(marker));
}

/** Prefix a detail message so downstream layers can classify it. */
export function markPlatformAuthExpired(detail: string): string {
  return `[${PLATFORM_AUTH_EXPIRED_CODE}] ${detail}`;
}
