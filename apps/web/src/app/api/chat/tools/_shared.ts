/** Auth context passed from the Route Handler */
export interface AuthContext {
  token: string;
  orgId: string;
}

/** Helper to call the backend API from within tool execute */
export function createApiCaller(auth: AuthContext) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${auth.token}`,
    'x-organization-id': auth.orgId,
  };

  return async function apiCall(path: string, options: { method?: string; body?: unknown } = {}) {
    const { method = 'GET', body } = options;
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  };
}
