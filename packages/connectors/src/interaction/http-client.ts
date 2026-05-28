export interface PlatformResponse<T> {
  success: boolean;
  data: T;
  errorCode?: string;
  errorMessage?: string;
}

export async function platformGet<T>(
  url: string,
  headers: Record<string, string>,
): Promise<PlatformResponse<T>> {
  try {
    const res = await fetch(url, { method: 'GET', headers });
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
    const res = await fetch(url, {
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
