export interface PlatformResponse<T> {
  success: boolean;
  data: T;
  errorCode?: string;
  errorMessage?: string;
}

/** Shared secret for authenticating with the browser-runner service. */
const RUNNER_SECRET = process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';

/** Fetch with AbortController timeout so stalled connections don't hang forever. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 60_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Inject browser-runner auth header when calling the runner service
    const isRunnerUrl = url.includes('localhost:3200') || url.includes(process.env.BROWSER_RUNNER_URL || '__none__');
    const headers = new Headers(init.headers);
    if (isRunnerUrl && RUNNER_SECRET && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${RUNNER_SECRET}`);
    }
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function platformGet<T>(
  url: string,
  headers: Record<string, string>,
): Promise<PlatformResponse<T>> {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers });
    const json = await res.json();
    if (!res.ok) {
      const detail =
        (json as Record<string, unknown>)?.details as string | undefined ||
        (json as Record<string, unknown>)?.error as string | undefined ||
        `Request failed with HTTP ${res.status}`;
      return {
        success: false,
        data: json as T,
        errorMessage: detail,
      };
    }
    return { success: true, data: json as T };
  } catch (err) {
    return {
      success: false,
      data: null as T,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function platformPost<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 60_000,
): Promise<PlatformResponse<T>> {
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }, timeoutMs);
    const json = await res.json();
    if (!res.ok) {
      const detail =
        (json as Record<string, unknown>)?.details as string | undefined ||
        (json as Record<string, unknown>)?.error as string | undefined ||
        `Request failed with HTTP ${res.status}`;
      return {
        success: false,
        data: json as T,
        errorMessage: detail,
      };
    }
    return { success: true, data: json as T };
  } catch (err) {
    return {
      success: false,
      data: null as T,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
