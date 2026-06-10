import type { ToolExecutionContext } from './types.js';

/**
 * Create an API caller bound to the given execution context.
 * Mirrors the createApiCaller pattern from apps/web/src/app/api/chat/tools/_shared.ts.
 */
export function createApiCallerFromContext(ctx: ToolExecutionContext) {
  return async function apiCall(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ) {
    const { method = 'GET', body } = options;
    const res = await fetch(`${ctx.apiBase}${path}`, {
      method,
      headers: ctx.headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(
        (err as Record<string, string>).error || `API error: ${res.status}`
      );
    }
    return res.json();
  };
}
