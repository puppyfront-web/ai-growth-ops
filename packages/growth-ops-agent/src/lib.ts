/**
 * Library barrel for @ai-growth-ops/growth-ops-agent.
 *
 * `src/index.ts` is the CLI entry-point (it calls `main()` and starts the MCP
 * server as a side-effect), so it must NOT be imported as a library. This
 * module is the importable surface for tooling that needs the underlying
 * HTTP client (e.g. the runtime package's domain-agent tools).
 */
export { BrowserRunnerClient } from './browser-runner-client.js';
export type { PublishArgs } from './browser-runner-client.js';
export { SessionStore } from './session-store.js';
