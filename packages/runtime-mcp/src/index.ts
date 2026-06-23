export * from './types.js';
export { InMemoryWorkingMemory, StaticPreferencesStore } from './memory-stubs.js';
export { buildNodeDirective } from './node-directive.js';
export { InMemoryRunStore } from './run-store.js';
export { EnvCredentialResolver } from './credentials.js';
export { createToolExecutor } from './tool-executor.js';
export type { ToolExecutor } from './tool-executor.js';
export { createOrchestrator } from './orchestrator.js';
export type { Orchestrator } from './orchestrator.js';
export { buildMcpServer, startServerFromEnv } from './server.js';

// Bin entry: only start the stdio server when executed directly (node dist/index.js),
// never when imported (e.g. by vitest or the in-process tests).
import { pathToFileURL } from 'node:url';
import { startServerFromEnv as startServer } from './server.js';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err: unknown) => {
    console.error('[runtime-mcp] fatal:', err);
    process.exit(1);
  });
}
