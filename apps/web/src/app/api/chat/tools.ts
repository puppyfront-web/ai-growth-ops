import { tool } from 'ai';
import { z } from 'zod';

/** Auth context passed from the Route Handler */
interface AuthContext {
  token: string;
  orgId: string;
}

/** Helper to call the backend API from within tool execute */
function createApiCaller(auth: AuthContext) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${auth.token}`,
    'x-organization-id': auth.orgId,
  };

  return async function apiCall(path: string, options: { method?: string; body?: unknown } = {}) {
    const { method = 'GET', body } = options;
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  };
}

export function createTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  const listAccounts = tool({
    description: '列出用户已连接的所有平台账号及其状态',
    inputSchema: z.object({}),
    execute: async () => {
      const accounts = await apiCall('/api/accounts');
      return { accounts };
    },
  });

  const checkCookieStatus = tool({
    description: '检查指定平台账号的 cookie 是否有效',
    inputSchema: z.object({
      accountId: z.string().optional().describe('账号 ID，不传则检查所有账号'),
    }),
    execute: async ({ accountId }) => {
      const accounts = await apiCall('/api/accounts');
      const targets = accountId
        ? accounts.filter((a: Record<string, unknown>) => a.id === accountId)
        : accounts;
      return {
        accounts: targets.map((a: Record<string, unknown>) => ({
          id: a.id,
          platform: a.platform,
          name: a.name,
          status: a.status,
          hasCookie: !!a.cookieRef,
          mode: a.mode,
        })),
      };
    },
  });

  const publishContent = tool({
    description: '将内容发布到指定平台。需要 contentId 和目标平台列表。',
    inputSchema: z.object({
      contentId: z.string().describe('要发布的内容 ID'),
      platforms: z.array(z.string()).describe('目标平台列表，如 ["douyin", "xiaohongshu"]'),
      scheduledAt: z.string().optional().describe('定时发布时间，ISO 格式'),
    }),
    execute: async ({ contentId, platforms, scheduledAt }) => {
      const accounts = await apiCall('/api/accounts');
      const platformAccountIds = accounts
        .filter((a: Record<string, unknown>) => platforms.includes(a.platform as string))
        .map((a: Record<string, unknown>) => a.id);
      if (platformAccountIds.length === 0) {
        return { error: `未找到目标平台 ${platforms.join(',')} 的已连接账号` };
      }
      const result = await apiCall('/api/publish-jobs/batch', {
        method: 'POST',
        body: { contentItemId: contentId, platformAccountIds, scheduledAt },
      });
      return { published: result };
    },
  });

  const syncComments = tool({
    description: '从指定平台拉取最新评论',
    inputSchema: z.object({
      platform: z.string().describe('平台名称，如 douyin'),
      platformAccountId: z.string().describe('平台账号 ID'),
      limit: z.number().optional().describe('拉取数量，默认 50'),
    }),
    execute: async ({ platform, platformAccountId, limit }) => {
      const result = await apiCall('/api/interactions/sync', {
        method: 'POST',
        body: { platform, platformAccountId, syncType: 'comments', limit: limit || 50 },
      });
      return result;
    },
  });

  const createContent = tool({
    description: '使用 AI 创建新内容。返回创建的内容 ID 供后续发布。',
    inputSchema: z.object({
      title: z.string().describe('内容标题'),
      body: z.string().describe('内容正文'),
      type: z.string().optional().describe('内容类型：text_image | video | article，默认 text_image'),
    }),
    execute: async ({ title, body, type }) => {
      const result = await apiCall('/api/content-items', {
        method: 'POST',
        body: { title, body, type: type || 'text_image' },
      });
      return { contentItem: result };
    },
  });

  return {
    list_accounts: listAccounts,
    check_cookie_status: checkCookieStatus,
    publish_content: publishContent,
    sync_comments: syncComments,
    create_content: createContent,
  };
}
