import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server
} from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { routeRequest } from './routes';

// Load .env from monorepo root
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
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
})();

export function createBrowserRunnerServer(): Server {
  return createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      try {
        await routeRequest(request, response);
      } catch (error) {
        response.writeHead(500, {
          'content-type': 'application/json; charset=utf-8'
        });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        );
      }
    }
  );
}

export async function startBrowserRunnerServer(
  options: { port?: number; host?: string } = {}
): Promise<Server> {
  const port = options.port ?? Number(process.env.BROWSER_RUNNER_PORT ?? 3200);
  const host = options.host ?? '0.0.0.0';
  const server = createBrowserRunnerServer();

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await startBrowserRunnerServer();
  console.log(
    `Browser Runner listening on http://localhost:${process.env.BROWSER_RUNNER_PORT ?? 3200}`
  );
}
