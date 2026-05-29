export interface PlatformResponse<T> {
  success: boolean;
  data: T;
  errorCode?: string;
  errorMessage?: string;
}

/** Fetch with AbortController timeout so stalled connections don't hang forever. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 60_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
): Promise<PlatformResponse<T>> {
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { success: true, data: json as T };
  } catch (err) {
    return {
      success: false,
      data: null as T,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
