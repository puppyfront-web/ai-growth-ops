export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'auth_token';

export const authToken = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  const token = authToken.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function handleUnauthorized(): never {
  authToken.clear();
  window.location.href = '/login';
  throw new ApiError(401, 'UNAUTHORIZED', '未登录或登录已过期');
}

function extractErrorMessage(body: Record<string, unknown>, fallback: string): string {
  const err = body.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  if (typeof body.message === 'string') return body.message;
  return fallback;
}

function extractErrorCode(body: Record<string, unknown>): string {
  const err = body.error;
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return 'UNKNOWN';
}

async function parseError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message = extractErrorMessage(body, res.statusText);
  return new ApiError(res.status, extractErrorCode(body), message);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: buildHeaders() });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', headers: buildHeaders() });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** Multipart upload — do not set Content-Type; Authorization is attached automatically. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = authToken.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { method: 'POST', headers, body: formData });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}
