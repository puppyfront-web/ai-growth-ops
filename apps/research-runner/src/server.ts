import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { pathToFileURL } from 'node:url';
import { routeRequest } from './routes.js';

export function createResearchRunnerServer(): Server {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  });
}

export async function startResearchRunnerServer(options: { port?: number; host?: string } = {}): Promise<Server> {
  const port = options.port ?? Number(process.env.RESEARCH_RUNNER_PORT ?? 3300);
  const host = options.host ?? '0.0.0.0';
  const server = createResearchRunnerServer();

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startResearchRunnerServer();
  console.log(`Research Runner listening on http://localhost:${process.env.RESEARCH_RUNNER_PORT ?? 3300}`);
}
