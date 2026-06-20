import { z } from 'zod';
import {
  registerToolGroup,
  toolExists,
  type ToolDefinition
} from '@ai-growth-ops/ai-tools';
import { BrowserRunnerClient } from '@ai-growth-ops/growth-ops-agent';

/**
 * First-slice domain tools for the content + publish agents.
 *
 * These 5 tools use `domain.action` naming to avoid colliding with the legacy
 * snake_case ai-tools. They proxy the browser-runner HTTP service through
 * `BrowserRunnerClient`. Cookie is supplied as a tool INPUT argument by the
 * caller (Task 9 worker decrypts it from PlatformAccount.cookieRef) and never
 * appears in the agent system prompt or LLM context.
 *
 * `__risk` / `__confidence` are agent self-assessment fields that
 * `runDomainAgent`'s onToolCall (Task 6) extracts + strips before calling
 * `execute`, so they are `.optional()` and never read here.
 */

const client = new BrowserRunnerClient();

const listVideos: ToolDefinition = {
  name: 'content.list_videos',
  description:
    "List the account's own published videos with real performance stats " +
    '(plays / likes / comments). Read-only.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    limit: z.number().min(1).max(100).optional(),
    cookie: z.string().describe('decrypted platform cookie')
  }),
  execute: async ({ platform, cookie, limit }) =>
    client.listVideos(platform, cookie, limit as number | undefined)
};

const publishVideo: ToolDefinition = {
  name: 'publish.video',
  description:
    'Publish content to a platform. WRITE — caller must self-assess ' +
    '__risk and __confidence.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    content: z.string(),
    title: z.string().optional(),
    mediaFilePaths: z.array(z.string()).optional(),
    cookie: z.string(),
    __risk: z.enum(['low', 'medium', 'high']).optional(),
    __confidence: z.number().min(0).max(1).optional()
  }),
  execute: async (args) =>
    client.publish({
      platform: args.platform,
      cookie: args.cookie,
      contentType: 'video',
      content: args.content,
      title: args.title,
      mediaFilePaths: args.mediaFilePaths
    })
};

const checkStatus: ToolDefinition = {
  name: 'publish.check_status',
  description: 'Check publish / review status of a post. Read-only.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    cookie: z.string(),
    externalPostId: z.string().optional(),
    contentManagementUrl: z.string().optional()
  }),
  execute: async ({ platform, cookie, externalPostId, contentManagementUrl }) =>
    client.checkPublishStatus(platform, cookie, {
      externalPostId,
      contentManagementUrl
    })
};

const authLogin: ToolDefinition = {
  name: 'auth.login',
  description:
    'Start a QR-login session and poll until logged in. WRITE — returns ' +
    'cookies. Caller self-assesses __risk.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    __risk: z.enum(['low', 'medium', 'high']).optional(),
    __confidence: z.number().min(0).max(1).optional()
  }),
  execute: async ({ platform }) => {
    const session = await client.startSession(platform);
    // poll until logged_in, expired, or error (cap ~5 min at 5 s intervals)
    for (let i = 0; i < 60; i++) {
      const status = await client.sessionStatus(session.sessionId);
      if (status.status === 'logged_in') {
        return {
          loggedIn: true,
          cookieLength: (status.cookies ?? '').length,
          cookies: status.cookies
        };
      }
      if (status.status === 'expired' || status.status === 'error') {
        return { loggedIn: false, status: status.status };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return { loggedIn: false, status: 'timeout' };
  }
};

const authStatus: ToolDefinition = {
  name: 'auth.status',
  description: 'Validate a cookie is still logged in. Read-only.',
  inputSchema: z.object({
    platform: z.enum(['douyin']),
    cookie: z.string()
  }),
  execute: async ({ platform, cookie }) =>
    client
      .listVideos(platform, cookie, 1)
      .then(() => ({ valid: true }), () => ({ valid: false }))
};

export const runtimeTools: ToolDefinition[] = [
  listVideos,
  publishVideo,
  checkStatus,
  authLogin,
  authStatus
];

/**
 * Register the runtime tool group into the ai-tools registry. Idempotent —
 * safe to call from agents/index.ts side-effect on every import.
 *
 * Checks the live registry (not a cached boolean flag) so it re-registers
 * correctly even after `clearRegistry()` is called between test files in the
 * same worker (e.g. agent-loop.test.ts calls clearRegistry() in beforeEach).
 */
export function registerRuntimeTools(): void {
  if (toolExists('content.list_videos')) return;
  registerToolGroup({ name: 'runtime', tools: runtimeTools });
}
