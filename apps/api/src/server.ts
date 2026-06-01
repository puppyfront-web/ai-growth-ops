import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Load .env from the monorepo root (walk up from this file's location)
(function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
})();

import {
  createDatabaseClient,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';
import { initSkills } from '@ai-growth-ops/skills';
import { routeRequest } from './routes';

const logger = createLogger('api');

export interface ApiServerOptions {
  db?: DatabaseClient;
}

function addSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function handleCORS(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  // Allow same-origin (Next.js proxy) or known dev origins
  const allowed = ['http://localhost:3001', 'http://localhost:3000'];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Publish-Progress-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

// Simple in-memory rate limiter for login endpoint
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 10; // max attempts
const LOGIN_RATE_WINDOW = 60_000; // per minute

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > LOGIN_RATE_LIMIT;
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  initSkills();
  const db = options.db ?? createDatabaseClient();

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    addSecurityHeaders(response);

    if (handleCORS(request, response)) return;

    try {
      await routeRequest(request, response, db);
    } catch (error) {
      logger.error('Unhandled request error', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        method: request.method,
      });
      response.writeHead(500, {
        'content-type': 'application/json; charset=utf-8'
      });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      );
    }
  });
}

export { isLoginRateLimited };

export async function startApiServer(
  options: ApiServerOptions & { port?: number; host?: string } = {}
): Promise<Server> {
  const port = options.port ?? Number(process.env.API_PORT ?? 3100);
  const host = options.host ?? '0.0.0.0';
  const server = createApiServer(options);

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await startApiServer();
  logger.info(`AI Growth Ops API listening on http://localhost:${process.env.API_PORT ?? 3100}`);
}
