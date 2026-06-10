import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';
import { createApiCallerFromContext } from '../_shared.js';

function apiCall(ctx: ToolExecutionContext) {
  return createApiCallerFromContext(ctx);
}

export const publishTools: ToolDefinition[] = [
  {
    name: 'list_accounts',
    description: '列出用户已连接的所有平台账号及其状态',
    inputSchema: z.object({}),
    execute: async (_input, ctx) => {
      const accounts = await apiCall(ctx)('/api/accounts');
      return { accounts };
    }
  },
  {
    name: 'check_cookie_status',
    description: '检查指定平台账号的 cookie 是否有效',
    inputSchema: z.object({
      accountId: z.string().optional().describe('账号 ID，不传则检查所有账号')
    }),
    execute: async ({ accountId }, ctx) => {
      const accounts = await apiCall(ctx)('/api/accounts');
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
          mode: a.mode
        }))
      };
    }
  },
  {
    name: 'login_account',
    description:
      '启动浏览器 QR 码登录流程。打开浏览器窗口供用户扫码登录。返回后需要轮询 check_login_status 确认登录完成。',
    inputSchema: z.object({
      accountId: z.string().describe('要登录的平台账号 ID')
    }),
    execute: async ({ accountId }, ctx) => {
      return apiCall(ctx)(`/api/accounts/${accountId}/browser-login/start`, {
        method: 'POST'
      });
    }
  },
  {
    name: 'check_login_status',
    description:
      '查询浏览器登录状态。登录启动后轮询此接口，直到返回 logged_in 或 expired。',
    inputSchema: z.object({
      accountId: z.string().describe('平台账号 ID')
    }),
    execute: async ({ accountId }, ctx) => {
      return apiCall(ctx)(`/api/accounts/${accountId}/browser-login/status`);
    }
  },
  {
    name: 'create_publish_job',
    description:
      '从已批准的内容变体创建发布任务。变体必须先通过合规检查并批准。',
    inputSchema: z.object({
      variantId: z.string().describe('已批准的变体 ID'),
      scheduledAt: z
        .string()
        .optional()
        .describe('定时发布时间，ISO 格式。不传则立即发布')
    }),
    execute: async ({ variantId, scheduledAt }, ctx) => {
      return apiCall(ctx)(
        `/api/content-variants/${variantId}/create-publish-job`,
        {
          method: 'POST',
          body: { scheduledAt }
        }
      );
    }
  },
  {
    name: 'execute_publish',
    description:
      '通过浏览器自动化执行发布任务。启动 browser-runner 自动发布内容到平台。',
    inputSchema: z.object({
      jobId: z.string().describe('发布任务 ID')
    }),
    execute: async ({ jobId }, ctx) => {
      return apiCall(ctx)(`/api/publish-jobs/${jobId}/execute`, {
        method: 'POST'
      });
    }
  },
  {
    name: 'check_publish_status',
    description: '查看发布任务状态，包括发布尝试和进度详情。',
    inputSchema: z.object({
      jobId: z.string().describe('发布任务 ID')
    }),
    execute: async ({ jobId }, ctx) => {
      return apiCall(ctx)(`/api/publish-jobs/${jobId}`);
    }
  },
  {
    name: 'retry_publish',
    description: '重试失败的发布任务。最多重试 3 次。',
    inputSchema: z.object({
      jobId: z.string().describe('发布任务 ID')
    }),
    execute: async ({ jobId }, ctx) => {
      return apiCall(ctx)(`/api/publish-jobs/${jobId}/retry`, {
        method: 'POST'
      });
    }
  },
  {
    name: 'publish_content',
    description:
      '将内容批量发布到指定平台（快捷方式）。自动匹配已连接的平台账号并创建发布任务。',
    inputSchema: z.object({
      contentId: z.string().describe('要发布的内容 ID'),
      platforms: z
        .array(z.string())
        .describe('目标平台列表，如 ["douyin", "xiaohongshu"]'),
      scheduledAt: z.string().optional().describe('定时发布时间，ISO 格式')
    }),
    execute: async ({ contentId, platforms, scheduledAt }, ctx) => {
      const call = apiCall(ctx);
      const accounts = await call('/api/accounts');
      const platformAccountIds = accounts
        .filter((a: Record<string, unknown>) =>
          platforms.includes(a.platform as string)
        )
        .map((a: Record<string, unknown>) => a.id);
      if (platformAccountIds.length === 0) {
        return {
          error: `未找到目标平台 ${platforms.join(',')} 的已连接账号`
        };
      }
      const result = await call('/api/publish-jobs/batch', {
        method: 'POST',
        body: { contentItemId: contentId, platformAccountIds, scheduledAt }
      });
      return { published: result };
    }
  }
];
