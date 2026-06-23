// Real stdio smoke for @ai-growth-ops/runtime-mcp.
// Spawns the built server, connects over stdio, lists tools, then tears down.
// If the bin-entry guard doesn't fire (server never starts), client.connect hangs.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = new URL('../packages/runtime-mcp/dist/index.js', import.meta.url).pathname;
const transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
const client = new Client({ name: 'smoke', version: '0' }, { capabilities: {} });

const timeout = setTimeout(() => {
  console.error('SMOKE FAIL: timed out (bin-entry guard likely did not fire)');
  process.exit(1);
}, 8000);

await client.connect(transport);
const { tools } = await client.listTools();
const has = (n) => tools.some((t) => t.name === n);
console.log(`SMOKE OK: ${tools.length} tools | supervisor.start=${has('supervisor.start')} | supervisor.report=${has('supervisor.report')} | content.list_videos=${has('content.list_videos')}`);

clearTimeout(timeout);
await client.close();
process.exit(0);
