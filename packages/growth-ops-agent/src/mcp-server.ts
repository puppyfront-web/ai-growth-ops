import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { CAPABILITIES } from '@ai-growth-ops/capability-schema';
import { BrowserRunnerClient } from './browser-runner-client.js';
import { SessionStore } from './session-store.js';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Mutating tools (publish / reply) refuse to run unless `confirmed: true`.
 * This enforces the human-in-the-loop gate at the tool layer, not just in the
 * skill prompt — the model must surface the exact payload and get approval first.
 */
const WRITE_INSTRUCTION =
  'REQUIRED: set `confirmed: true` ONLY after the human operator has explicitly approved this exact action against the live account. If false/absent, the call is refused.';

function requireConfirmation(args: Record<string, unknown>, action: string) {
  if (args.confirmed !== true) {
    return {
      blocked: true,
      message: `Refused: ${action} mutates the live account. Present the exact payload to the operator; on explicit approval, re-call with \`confirmed: true\`.`
    };
  }
  return null;
}

export function buildToolDefs(
  client: BrowserRunnerClient,
  store: SessionStore
): ToolDef[] {
  return [
    {
      name: 'auth_login',
      description:
        `[${CAPABILITIES.AUTH_LOGIN}] Start an interactive QR-code login for a platform (Douyin first). ` +
        `Returns a sessionId. The browser-runner shows a QR code in a headed window for the operator to scan; ` +
        `then poll auth_status. Platforms: douyin.`,
      inputSchema: {
        type: 'object',
        properties: { platform: { type: 'string', enum: ['douyin'] } },
        required: ['platform']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const { sessionId } = await client.startSession(platform);
        store.recordPending(sessionId, platform);
        return {
          sessionId,
          status: 'waiting_scan',
          instruction:
            'A QR code is displayed in the browser-runner headed window. Ask the operator to scan it, then call auth_status.'
        };
      }
    },
    {
      name: 'auth_status',
      description:
        `[${CAPABILITIES.AUTH_CHECK}] Poll a login session. On success (status=logged_in) the cookie is cached ` +
        `internally so subsequent tools run without re-auth.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          platform: { type: 'string', enum: ['douyin'] }
        },
        required: ['sessionId']
      },
      run: async (args) => {
        const sessionId = String(args.sessionId ?? '');
        const status = await client.sessionStatus(sessionId);
        if (status.status === 'logged_in' && status.cookies) {
          const platform =
            (args.platform ? String(args.platform) : undefined) ??
            store.platformFor(sessionId);
          if (!platform) {
            return {
              status: status.status,
              warning:
                'Logged in but no platform mapping recorded. Re-seed or pass platform.'
            };
          }
          store.set(platform, {
            cookie: status.cookies,
            sessionId,
            loggedInAt: new Date().toISOString()
          });
          return {
            status: 'logged_in',
            platform,
            cookieLength: status.cookies.length
          };
        }
        return status;
      }
    },
    {
      name: 'content_list_videos',
      description:
        `[${CAPABILITIES.LIST_VIDEOS}] List the account's own published videos with REAL performance statistics ` +
        `(plays, likes, comments, shares). This is the primary reliable data source today. Read-only.`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          limit: { type: 'number', minimum: 1, maximum: 100 }
        },
        required: ['platform']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        const limit = args.limit != null ? Number(args.limit) : undefined;
        return await client.listVideos(platform, cookie, limit);
      }
    },
    {
      name: 'interaction_fetch_comments',
      description:
        `[${CAPABILITIES.FETCH_COMMENTS}] Fetch recent comments on the account's content. ` +
        `NOTE: the public comment-page path currently returns empty (tracked debt) — prefer content_list_videos for engagement signal.`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          sourceContentId: { type: 'string' },
          limit: { type: 'number' }
        },
        required: ['platform']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.fetchComments(platform, cookie, {
          sourceContentId:
            args.sourceContentId != null ? String(args.sourceContentId) : undefined,
          limit: args.limit != null ? Number(args.limit) : undefined
        });
      }
    },
    {
      name: 'interaction_fetch_messages',
      description:
        `[${CAPABILITIES.FETCH_MESSAGES}] Fetch recent private messages / DMs. ` +
        `NOTE: the notification-inbox path currently returns empty (tracked debt).`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          limit: { type: 'number' }
        },
        required: ['platform']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.fetchMessages(platform, cookie, {
          limit: args.limit != null ? Number(args.limit) : undefined
        });
      }
    },
    {
      name: 'interaction_reply_comment',
      description:
        `[${CAPABILITIES.REPLY_COMMENT}] Reply to a public comment. WRITE — ${WRITE_INSTRUCTION}`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          externalCommentId: { type: 'string' },
          replyText: { type: 'string' },
          sourceContentId: { type: 'string' },
          confirmed: { type: 'boolean' }
        },
        required: ['platform', 'externalCommentId', 'replyText', 'confirmed']
      },
      run: async (args) => {
        const block = requireConfirmation(args, 'replying to a public comment');
        if (block) return block;
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.replyComment(
          platform,
          cookie,
          String(args.externalCommentId ?? ''),
          String(args.replyText ?? ''),
          args.sourceContentId != null ? String(args.sourceContentId) : undefined
        );
      }
    },
    {
      name: 'interaction_reply_message',
      description:
        `[${CAPABILITIES.REPLY_MESSAGE}] Send a private message to a user. WRITE — ${WRITE_INSTRUCTION}`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          externalUserId: { type: 'string' },
          messageText: { type: 'string' },
          confirmed: { type: 'boolean' }
        },
        required: ['platform', 'externalUserId', 'messageText', 'confirmed']
      },
      run: async (args) => {
        const block = requireConfirmation(args, 'sending a private message');
        if (block) return block;
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.replyMessage(
          platform,
          cookie,
          String(args.externalUserId ?? ''),
          String(args.messageText ?? '')
        );
      }
    },
    {
      name: 'lead_search',
      description:
        `[${CAPABILITIES.LEAD_EXTRACT}] Search public content by keyword and harvest comments from the top results — ` +
        `used to find prospects around a topic in the 公域. Read-only.`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin', 'xiaohongshu'] },
          keyword: { type: 'string' },
          topN: { type: 'number', minimum: 1, maximum: 10 }
        },
        required: ['platform', 'keyword']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.searchComments(
          platform,
          cookie,
          String(args.keyword ?? ''),
          { topN: args.topN != null ? Number(args.topN) : undefined }
        );
      }
    },
    {
      name: 'publish_video',
      description:
        `[${CAPABILITIES.PUBLISH_VIDEO}] Publish content. Douyin REQUIRES media (mediaFilePaths to local mp4/mov, or mediaUrls). WRITE — ${WRITE_INSTRUCTION}`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          contentType: { type: 'string' },
          content: { type: 'string' },
          title: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          mediaFilePaths: { type: 'array', items: { type: 'string' } },
          mediaUrls: { type: 'array', items: { type: 'string' } },
          confirmed: { type: 'boolean' }
        },
        required: ['platform', 'contentType', 'content', 'confirmed']
      },
      run: async (args) => {
        const block = requireConfirmation(args, 'publishing content to the live account');
        if (block) return block;
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.publish({
          platform,
          cookie,
          contentType: String(args.contentType ?? 'video'),
          content: String(args.content ?? ''),
          title: args.title != null ? String(args.title) : undefined,
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
          mediaFilePaths: Array.isArray(args.mediaFilePaths)
            ? (args.mediaFilePaths as string[])
            : undefined,
          mediaUrls: Array.isArray(args.mediaUrls)
            ? (args.mediaUrls as string[])
            : undefined
        });
      }
    },
    {
      name: 'publish_check_status',
      description:
        `[${CAPABILITIES.PUBLISH_VIDEO}] Check the review/publish status of a previously published post. Read-only.`,
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: ['douyin'] },
          externalPostId: { type: 'string' }
        },
        required: ['platform']
      },
      run: async (args) => {
        const platform = String(args.platform ?? '');
        const cookie = store.requireCookie(platform);
        return await client.checkPublishStatus(platform, cookie, {
          externalPostId:
            args.externalPostId != null ? String(args.externalPostId) : undefined
        });
      }
    }
  ];
}

export async function startServer(
  client: BrowserRunnerClient,
  store: SessionStore
) {
  const tools = buildToolDefs(client, store);

  const server = new Server(
    { name: 'growth-ops-agent', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Tool['inputSchema']
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }]
      };
    }
    try {
      const result = await tool.run(args);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error)
          }
        ]
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
