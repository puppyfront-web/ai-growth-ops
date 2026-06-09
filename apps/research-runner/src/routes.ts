import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHealthSnapshot } from '@ai-growth-ops/shared';
import { executeResearch } from './executor.js';

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
  {
    method: 'GET',
    pattern: '/health',
    handler: async (_req, res) => {
      sendJson(res, 200, createHealthSnapshot('research-runner'));
    }
  },
  {
    method: 'POST',
    pattern: '/execute',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.researchTaskId || !body?.platform) {
        sendJson(res, 400, {
          error: 'researchTaskId and platform are required'
        });
        return;
      }

      try {
        const result = await executeResearch({
          researchTaskId: String(body.researchTaskId),
          provider: String(body.provider || 'sandbox'),
          platform: String(body.platform),
          taskType: String(body.taskType || 'keyword_research'),
          keywords: body.keywords as string[] | undefined,
          maxPosts: body.maxPosts as number | undefined,
          maxComments: body.maxComments as number | undefined,
          targetAccountIds: body.targetAccountIds as string[] | undefined,
          cookie: body.cookie as string | undefined
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : 'Execution failed'
        });
      }
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
    `http://localhost:${process.env.RESEARCH_RUNNER_PORT ?? 3300}`
  );
  const result = matchRoute(req.method ?? 'GET', url.pathname);

  if (!result) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '')
    ? await readBody(req)
    : null;

  await result.handler(req, res, { url, params: result.params, body });
}
