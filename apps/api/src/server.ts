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

export function createApiServer(options: ApiServerOptions = {}): Server {
  initSkills();
  const db = options.db ?? createDatabaseClient();

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
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
