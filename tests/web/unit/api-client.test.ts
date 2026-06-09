import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, authToken, apiGet, apiPost } from '@/lib/api/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  it('attaches Authorization header when token exists', async () => {
    authToken.set('test-token-123');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' })
    });

    await apiGet('/api/test');

    const call = mockFetch.mock.calls[0];
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('throws ApiError on 4xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () =>
        Promise.resolve({ error: { code: 'NOT_FOUND', message: '资源不存在' } })
    });

    try {
      await apiGet('/api/missing');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('资源不存在');
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('clears token and redirects on 401', async () => {
    authToken.set('expired-token');

    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () =>
        Promise.resolve({ error: { code: 'UNAUTHORIZED', message: '未授权' } })
    });

    try {
      await apiPost('/api/test', {});
    } catch {
      /* expected 401 error */
    }

    expect(authToken.get()).toBeNull();
    expect(window.location.href).toBe('/login');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true
    });
  });
});
