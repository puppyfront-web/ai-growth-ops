import { createApiServer } from '../../apps/api/src/server';
import { createDatabaseClient, resetDatabase } from '@ai-growth-ops/database';
import { seedDatabase } from '../../packages/database/src/seed';
import type { Server } from 'node:http';

export interface TestContext {
  server: Server;
  db: ReturnType<typeof createDatabaseClient> extends Promise<infer T>
    ? T
    : never;
  baseUrl: string;
}

let testServer: Server | null = null;
let testDb: Awaited<ReturnType<typeof createDatabaseClient>> | null = null;
let testPort = 3199;

export async function setupTestServer(): Promise<TestContext> {
  testPort = 3199;
  const db = await createDatabaseClient();
  testDb = db;
  await resetDatabase(db);
  await seedDatabase(db);

  const server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    server.listen(testPort, () => resolve())
  );
  testServer = server;

  return { server, db, baseUrl: `http://127.0.0.1:${testPort}` };
}

export async function teardownTestServer(): Promise<void> {
  if (testServer) {
    await new Promise<void>((resolve) => testServer!.close(() => resolve()));
    testServer = null;
  }
  if (testDb) {
    await testDb.$disconnect();
    testDb = null;
  }
}

export async function getJson(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

export async function postJson(baseUrl: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

export async function putJson(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

export async function patchJson(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

export async function deleteJson(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json().catch(() => null) };
}
