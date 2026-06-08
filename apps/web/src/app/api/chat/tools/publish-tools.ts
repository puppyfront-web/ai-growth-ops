import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller, type AuthContext } from './_shared';

export function createPublishTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  const listAccounts = tool({
    description: '列出用户已连接的所有平台账号及其状态',
    parameters: z.object({}),
    execute: async () => {
      const accounts = await apiCall('/api/accounts');
      return { accounts };
    },
  });

  const checkCookieStatus = tool({
    description: '检查指定平台账号的 cookie 是否有效',
    parameters: z.object({
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

  const loginAccount = tool({
    description: '启动浏览器 QR 码登录流程。打开浏览器窗口供用户扫码登录。返回后需要轮询 check_login_status 确认登录完成。',
    parameters: z.object({
      accountId: z.string().describe('要登录的平台账号 ID'),
    }),
    execute: async ({ accountId }) => {
      return apiCall(`/api/accounts/${accountId}/browser-login/start`, {
        method: 'POST',
      });
    },
  });

  const checkLoginStatus = tool({
    description: '查询浏览器登录状态。登录启动后轮询此接口，直到返回 logged_in 或 expired。',
    parameters: z.object({
      accountId: z.string().describe('平台账号 ID'),
    }),
    execute: async ({ accountId }) => {
      return apiCall(`/api/accounts/${accountId}/browser-login/status`);
    },
  });

  const createPublishJob = tool({
    description: '从已批准的内容变体创建发布任务。变体必须先通过合规检查并批准。',
    parameters: z.object({
      variantId: z.string().describe('已批准的变体 ID'),
      scheduledAt: z.string().optional().describe('定时发布时间，ISO 格式。不传则立即发布'),
    }),
    execute: async ({ variantId, scheduledAt }) => {
      return apiCall(`/api/content-variants/${variantId}/create-publish-job`, {
        method: 'POST',
        body: { scheduledAt },
      });
    },
  });

  const executePublish = tool({
    description: '通过浏览器自动化执行发布任务。启动 browser-runner 自动发布内容到平台。',
    parameters: z.object({
      jobId: z.string().describe('发布任务 ID'),
    }),
    execute: async ({ jobId }) => {
      return apiCall(`/api/publish-jobs/${jobId}/execute`, {
        method: 'POST',
      });
    },
  });

  const checkPublishStatus = tool({
    description: '查看发布任务状态，包括发布尝试和进度详情。',
    parameters: z.object({
      jobId: z.string().describe('发布任务 ID'),
    }),
    execute: async ({ jobId }) => {
      return apiCall(`/api/publish-jobs/${jobId}`);
    },
  });

  const retryPublish = tool({
    description: '重试失败的发布任务。最多重试 3 次。',
    parameters: z.object({
      jobId: z.string().describe('发布任务 ID'),
    }),
    execute: async ({ jobId }) => {
      return apiCall(`/api/publish-jobs/${jobId}/retry`, {
        method: 'POST',
      });
    },
  });

  const publishContent = tool({
    description: '将内容批量发布到指定平台（快捷方式）。自动匹配已连接的平台账号并创建发布任务。',
    parameters: z.object({
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

  return {
    list_accounts: listAccounts,
    check_cookie_status: checkCookieStatus,
    login_account: loginAccount,
    check_login_status: checkLoginStatus,
    create_publish_job: createPublishJob,
    execute_publish: executePublish,
    check_publish_status: checkPublishStatus,
    retry_publish: retryPublish,
    publish_content: publishContent,
  };
}
