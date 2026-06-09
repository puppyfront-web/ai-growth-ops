import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHealthSnapshot } from '@ai-growth-ops/shared';
import {
  getOrCreatePublishConnector,
  getOrCreateConnector
} from '@ai-growth-ops/connectors';
import type { PlatformCode, InteractionMode } from '@ai-growth-ops/connectors';

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
      sendJson(res, 200, createHealthSnapshot('provider-gateway'));
    }
  },
  {
    method: 'GET',
    pattern: '/capabilities/:platform',
    handler: async (_req, res, ctx) => {
      const { platform } = ctx.params;
      const mode = ctx.url.searchParams.get('mode') || 'browser_assist';
      try {
        const connector = getOrCreatePublishConnector(
          platform as PlatformCode,
          mode as InteractionMode
        );
        const capabilities = await connector.getCapabilities();
        sendJson(res, 200, capabilities);
      } catch {
        sendJson(res, 400, { error: `Unknown platform: ${platform}` });
      }
    }
  },
  {
    method: 'POST',
    pattern: '/publish',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.platform || !body?.content) {
        sendJson(res, 400, { error: 'platform and content are required' });
        return;
      }

      const mode = String(body.mode || 'browser_assist');
      const connector = getOrCreatePublishConnector(
        body.platform as PlatformCode,
        mode as InteractionMode
      );

      const result = await connector.publishContent({
        platformAccountId: String(body.platformAccountId || ''),
        contentType: String(body.contentType || 'text_image') as
          | 'text_image'
          | 'video'
          | 'article'
          | 'answer',
        title: body.title as string | undefined,
        content: String(body.content),
        tags: body.tags as string[] | undefined
      });

      sendJson(res, 200, result);
    }
  },
  {
    method: 'POST',
    pattern: '/check-status',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as Record<string, unknown> | null;
      if (!body?.platform || !body?.externalPostId) {
        sendJson(res, 400, {
          error: 'platform and externalPostId are required'
        });
        return;
      }

      const mode = String(body.mode || 'browser_assist');
      const connector = getOrCreatePublishConnector(
        body.platform as PlatformCode,
        mode as InteractionMode
      );

      if (!connector.checkStatus) {
        sendJson(res, 400, {
          error: 'Platform does not support status checking'
        });
        return;
      }

      const result = await connector.checkStatus({
        platformAccountId: String(body.platformAccountId || ''),
        externalPostId: String(body.externalPostId)
      });

      sendJson(res, 200, result);
    }
  },
  {
    method: 'GET',
    pattern: '/interaction-capabilities/:platform',
    handler: async (_req, res, ctx) => {
      const { platform } = ctx.params;
      const mode = ctx.url.searchParams.get('mode') || 'browser_assist';
      try {
        const connector = getOrCreateConnector(
          platform as PlatformCode,
          mode as InteractionMode
        );
        const capabilities = await connector.getCapabilities();
        sendJson(res, 200, capabilities);
      } catch {
        sendJson(res, 400, { error: `Unknown platform: ${platform}` });
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
    `http://localhost:${process.env.PROVIDER_GATEWAY_PORT ?? 3400}`
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
