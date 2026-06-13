import { BrowserRunnerClient } from './browser-runner-client.js';
import { SessionStore } from './session-store.js';
import { startServer } from './mcp-server.js';

async function main() {
  const client = new BrowserRunnerClient();
  const store = new SessionStore();

  // Allow pre-seeding a cookie for testing / headless runs without a QR scan.
  const cookieFile = process.env.GROWTH_OPS_COOKIE_FILE;
  if (cookieFile) {
    const platform = process.env.GROWTH_OPS_COOKIE_PLATFORM ?? 'douyin';
    const len = store.seedFromFile(cookieFile, platform);
    // stderr only — stdout is the JSON-RPC channel.
    console.error(
      `[growth-ops-agent] seeded ${platform} cookie (${len} chars) from ${cookieFile}`
    );
  }

  await startServer(client, store);
  console.error('[growth-ops-agent] MCP server ready on stdio');
}

main().catch((error) => {
  console.error('[growth-ops-agent] fatal:', error);
  process.exit(1);
});
