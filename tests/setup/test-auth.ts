/**
 * Test authentication helper for integration tests.
 *
 * Provides authenticated request helpers (get/post/put/del) that
 * include a valid Bearer token for the seeded admin user.
 */
import type { DatabaseClient } from '@ai-growth-ops/database';
import { createToken } from '../../apps/api/src/auth';

// Ensure AUTH_SECRET is set for token creation
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = 'test-auth-secret-for-integration-tests';
}

export interface TestAuthContext {
  token: string;
  userId: string;
  orgId: string;
  headers: Record<string, string>;
}

/**
 * Authenticate as the seeded admin user.
 * Call after resetDatabase + seedDatabase so the user exists.
 */
export async function getTestAuth(
  db: DatabaseClient,
  baseUrl: string
): Promise<TestAuthContext> {
  // Login to get a valid token for the seeded user
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local',
      password: process.env.ADMIN_PASSWORD || 'changeme123'
    })
  });

  if (loginRes.ok) {
    const body = (await loginRes.json()) as Record<string, unknown>;
    const token = body.token as string;
    const user = body.user as Record<string, unknown>;
    const userId = user.id as string;

    // Find the user's default org
    const member = await db.organizationMember.findFirst({
      where: { userId, status: 'active' },
      orderBy: { joinedAt: 'asc' }
    });
    const orgId = member?.organizationId || '';

    return {
      token,
      userId,
      orgId,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Organization-Id': orgId
      }
    };
  }

  // Fallback: create token directly if login route not available
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local';
  const user = await db.user.findFirst({ where: { email: adminEmail } });
  if (!user) throw new Error('Seeded admin user not found — run seedDatabase first');

  const token = createToken(user.id);
  const member = await db.organizationMember.findFirst({
    where: { userId: user.id, status: 'active' },
    orderBy: { joinedAt: 'asc' }
  });
  const orgId = member?.organizationId || '';

  return {
    token,
    userId: user.id,
    orgId,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': orgId
    }
  };
}

/** Authenticated fetch helpers */
export function createAuthFetch(baseUrl: string, auth: TestAuthContext) {
  async function get(url: string) {
    const res = await fetch(`${baseUrl}${url}`, { headers: auth.headers });
    return { status: res.status, body: await res.json() };
  }
  async function post(url: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${url}`, {
      method: 'POST',
      headers: {
        ...auth.headers,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
  }
  async function put(url: string, body: unknown) {
    const res = await fetch(`${baseUrl}${url}`, {
      method: 'PUT',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }
  async function patch(url: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${url}`, {
      method: 'PATCH',
      headers: {
        ...auth.headers,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json() };
  }
  async function del(url: string) {
    const res = await fetch(`${baseUrl}${url}`, {
      method: 'DELETE',
      headers: auth.headers
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { get, post, put, patch, del };
}
