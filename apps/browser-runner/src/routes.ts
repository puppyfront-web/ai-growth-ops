import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { sessionManager } from './session-manager';
import {
  getPlatformLoginConfig,
  getSupportedPlatforms
} from './platform-configs';
import { createHealthSnapshot } from '@ai-growth-ops/shared';
import { assistRoutes } from './assist-routes.js';
import { publishAssistRoutes } from './publish-routes.js';

// ── Shared-secret authentication ──────────────────────────────────
// Browser-runner is an internal service. All non-health endpoints
// require the caller to send an `Authorization: Bearer <SECRET>` header
// matching the BROWSER_RUNNER_SECRET env var (or falling back to
// TOKEN_ENCRYPTION_KEY for convenience in dev).
const RUNNER_SECRET =
  process.env.BROWSER_RUNNER_SECRET || process.env.TOKEN_ENCRYPTION_KEY || '';

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!RUNNER_SECRET) return true; // No secret configured — allow all (dev mode)
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return safeEqual(token, RUNNER_SECRET);
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { url: URL; params: Record<string, string>; body: unknown }
) => Promise<void>;

export interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const routes: Route[] = [
  ...assistRoutes,
  ...publishAssistRoutes,
  {
    method: 'GET',
    pattern: '/health',
    handler: async (_req, res) => {
      sendJson(res, 200, {
        ...createHealthSnapshot('browser-runner'),
        activeSessions: sessionManager.activeSessionCount,
        supportedPlatforms: getSupportedPlatforms()
      });
    }
  },
  {
    method: 'POST',
    pattern: '/session/start',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown> | null;
      const platform = body?.platform as string;
      if (!platform) {
        sendJson(res, 400, { error: 'Missing platform' });
        return;
      }
      try {
        getPlatformLoginConfig(platform);
      } catch {
        sendJson(res, 400, { error: `Unsupported platform: ${platform}` });
        return;
      }
      try {
        const result = await sessionManager.createSession(platform);
        sendJson(res, 200, { ...result, status: 'waiting_scan' });
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/session/:sessionId/status',
    handler: async (_req, res, ctx) => {
      const { sessionId } = ctx.params;
      try {
        const result = await sessionManager.getSessionStatus(sessionId);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/session/:sessionId/cancel',
    handler: async (_req, res, ctx) => {
      const { sessionId } = ctx.params;
      await sessionManager.cancelSession(sessionId);
      sendJson(res, 200, { ok: true });
    }
  }
];

interface MatchResult {
  handler: RouteHandler;
  params: Record<string, string>;
}

function matchRoute(method: string, pathname: string): MatchResult | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const patternParts = route.pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler: route.handler, params };
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', () => resolve(null));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
  });
}

export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(
    req.url ?? '/',
    `http://localhost:${process.env.BROWSER_RUNNER_PORT ?? 3200}`
  );
  const result = matchRoute(req.method ?? 'GET', url.pathname);

  if (!result) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  // Health endpoint is public; everything else requires the shared secret
  if (url.pathname !== '/health' && !isAuthorized(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '')
    ? await readBody(req)
    : null;

  await result.handler(req, res, { url, params: result.params, body });
}
