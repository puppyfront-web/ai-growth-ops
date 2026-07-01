/**
 * Unified platform API error detection.
 *
 * Each platform connector historically judged "did this API call succeed?"
 * with its own hardcoded field name and sentinel value, duplicated across a
 * dozen files:
 *   - douyin:    error_code / status_code  (0 = ok)
 *   - wechat*:   errcode                   (0 = ok)
 *   - baijiahao: errno                     (0 = ok)
 *   - zhihu:     error / code              (0 / absence = ok)
 *
 * This module centralises that logic so the per-platform connectors stop
 * re-implementing it and so error semantics are consistent. It is deliberately
 * conservative: when the expected error field is absent we treat the response
 * as NOT-an-error (the response shape varies wildly across endpoints, and a
 * false "error" would break working calls).
 */

/** Maps a platform code to the JSON field that carries its error code. */
const ERROR_FIELD_BY_PLATFORM: Record<string, string[]> = {
  douyin: ['error_code', 'status_code'],
  // PlatformCode uses underscores (wechat_official), not hyphens.
  wechat_official: ['errcode'],
  wechat_channels: ['errcode'],
  xiaohongshu: ['code', 'status'],
  baijiahao: ['errno'],
  zhihu: ['error', 'code']
};

/**
 * Returns true when the response body carries a non-zero platform error code.
 * Absent fields ⇒ not an error (caller decides success from data presence).
 *
 * Zhihu is special: it signals errors via a nested `error: { code, message }`
 * object (presence ⇒ error), not a flat numeric field. That mirrors the
 * original `if (resp.data?.error)` check in the zhihu connector.
 */
export function isApiError(
  body: Record<string, unknown>,
  platform: string
): boolean {
  if (platform === 'zhihu') {
    return body['error'] != null;
  }
  const fields = ERROR_FIELD_BY_PLATFORM[platform];
  if (!fields) return false;
  for (const field of fields) {
    const raw = body[field];
    if (raw === undefined || raw === null) continue;
    const code = Number(raw);
    if (Number.isFinite(code) && code !== 0) return true;
  }
  return false;
}

/** Extracts the first non-zero error code + a message if present. */
export function extractApiError(
  body: Record<string, unknown>,
  platform: string
): { code: string; message: string } | null {
  if (!isApiError(body, platform)) return null;

  if (platform === 'zhihu') {
    const err = body['error'] as Record<string, unknown> | undefined;
    const code = err?.['code'];
    const message = err?.['message'];
    return {
      code: code != null ? String(code) : 'UNKNOWN',
      message:
        (typeof message === 'string' && message) || 'Unknown Zhihu API error'
    };
  }

  const fields = ERROR_FIELD_BY_PLATFORM[platform];
  if (!fields) return null;
  for (const field of fields) {
    const raw = body[field];
    if (raw === undefined || raw === null) continue;
    const code = Number(raw);
    if (Number.isFinite(code) && code !== 0) {
      const message =
        (body.status_msg as string | undefined) ||
        (body.message as string | undefined) ||
        (body.errmsg as string | undefined) ||
        (body.msg as string | undefined) ||
        `${platform} API error ${code}`;
      return { code: String(code), message };
    }
  }
  return null;
}
