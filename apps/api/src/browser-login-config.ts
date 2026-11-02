import {
  getBrowserRunnerConfig,
  getBrowserRunnerHeaders,
  getPlatformLoginAdapter
} from '@ai-growth-ops/shared';

/** 登录页 URL 的单一事实源在 packages/shared/src/platform-login.ts。 */
export function getLoginUrl(platform: string): string {
  return getPlatformLoginAdapter(platform).loginUrl;
}

export function getBrowserRunnerUrl(): string {
  return getBrowserRunnerConfig().url;
}

/**
 * Shared-secret that browser-runner expects on every non-health request.
 * Mirrors the lookup in browser-runner/src/routes.ts so both sides agree.
 */
export function getRunnerSecret(): string {
  return getBrowserRunnerConfig().secret;
}

/**
 * Build the Authorization header for browser-runner calls.
 * Returns an empty object when no secret is configured (dev mode allows all).
 */
export function runnerHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return getBrowserRunnerHeaders(extra);
}

/**
 * Fetch with AbortController timeout so stalled connections to browser-runner don't hang.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
