import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../types.js';
import { createApiCallerFromContext } from '../_shared.js';

function apiCall(ctx: ToolExecutionContext) {
  return createApiCallerFromContext(ctx);
}

export const interactionTools: ToolDefinition[] = [
  {
    name: 'sync_comments',
    description: '从指定平台拉取最新评论（快捷方式）',
    inputSchema: z.object({
      platform: z.string().describe('平台名称，如 douyin'),
      platformAccountId: z.string().describe('平台账号 ID'),
      limit: z.number().optional().describe('拉取数量，默认 50')
    }),
    execute: async ({ platform, platformAccountId, limit }, ctx) => {
      return apiCall(ctx)('/api/interactions/sync', {
        method: 'POST',
        body: {
          platform,
          platformAccountId,
          syncType: 'comments',
          limit: limit || 50
        }
      });
    }
  },
  {
    name: 'sync_messages',
    description:
      '从指定平台同步最新评论或私信。通过浏览器自动化拉取，返回同步任务 ID。',
    inputSchema: z.object({
      platform: z.string().describe('平台名称，如 douyin, xiaohongshu'),
      platformAccountId: z.string().describe('平台账号 ID'),
      syncType: z
        .enum(['comments', 'messages', 'all'])
        .optional()
        .describe('同步类型：comments=评论, messages=私信, all=全部。默认 all')
    }),
    execute: async ({ platform, platformAccountId, syncType }, ctx) => {
      const call = apiCall(ctx);
      const type = syncType || 'all';
      if (type === 'all') {
        const [comments, messages] = await Promise.all([
          call('/api/interactions/sync', {
            method: 'POST',
            body: { platform, platformAccountId, syncType: 'comments' }
          }).catch(() => null),
          call('/api/interactions/sync', {
            method: 'POST',
            body: { platform, platformAccountId, syncType: 'messages' }
          }).catch(() => null)
        ]);
        return { comments, messages };
      }
      return call('/api/interactions/sync', {
        method: 'POST',
        body: { platform, platformAccountId, syncType: type }
      });
    }
  },
  {
    name: 'list_interactions',
    description: '查看最近的评论和私信。支持按平台、状态、类型筛选。',
    inputSchema: z.object({
      platform: z.string().optional().describe('筛选平台'),
      status: z
        .string()
        .optional()
        .describe('筛选状态：NEW | CLASSIFIED | REPLIED | IGNORED'),
      type: z.string().optional().describe('筛选类型：comment | message'),
      page: z.number().optional().describe('页码'),
      pageSize: z.number().optional().describe('每页数量')
    }),
    execute: async ({ platform, status, type, page, pageSize }, ctx) => {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (page) params.set('page', String(page));
      if (pageSize) params.set('pageSize', String(pageSize));
      const qs = params.toString();
      return apiCall(ctx)(`/api/interactions${qs ? `?${qs}` : ''}`);
    }
  },
  {
    name: 'classify_interaction',
    description:
      '使用 AI 线索分类技能对互动进行分类。返回意图类型、线索等级(A/B/C/D)、置信度和风险等级。',
    inputSchema: z.object({
      interactionId: z.string().describe('互动 ID')
    }),
    execute: async ({ interactionId }, ctx) => {
      return apiCall(ctx)(`/api/interactions/${interactionId}/classify`, {
        method: 'POST'
      });
    }
  },
  {
    name: 'suggest_reply',
    description:
      '使用 AI 回复建议技能生成回复建议。根据互动内容和分类结果智能推荐回复文本。',
    inputSchema: z.object({
      interactionId: z.string().describe('互动 ID')
    }),
    execute: async ({ interactionId }, ctx) => {
      return apiCall(ctx)(`/api/interactions/${interactionId}/suggest-reply`, {
        method: 'POST'
      });
    }
  },
  {
    name: 'reply_to_interaction',
    description:
      '回复一条评论或私信。通过浏览器自动化发布回复。高风险互动需要人工确认。',
    inputSchema: z.object({
      interactionId: z.string().describe('要回复的互动 ID'),
      content: z.string().describe('回复内容')
    }),
    execute: async ({ interactionId, content }, ctx) => {
      return apiCall(ctx)(`/api/interactions/${interactionId}/reply`, {
        method: 'POST',
        body: { content }
      });
    }
  },
  {
    name: 'convert_to_lead',
    description:
      '将已分类的互动转化为线索。创建线索记录，可后续同步到飞书或企业微信。',
    inputSchema: z.object({
      interactionId: z.string().describe('要转化的互动 ID')
    }),
    execute: async ({ interactionId }, ctx) => {
      return apiCall(ctx)(
        `/api/interactions/${interactionId}/convert-to-lead`,
        {
          method: 'POST'
        }
      );
    }
  },
  {
    name: 'get_auto_reply_config',
    description:
      '查看自动回复配置。包括是否启用、每日上限、置信度阈值、允许的回复类型等。',
    inputSchema: z.object({}),
    execute: async (_input, ctx) => {
      return apiCall(ctx)('/api/settings/auto-reply');
    }
  },
  {
    name: 'update_auto_reply_config',
    description:
      '更新自动回复配置。可修改启用状态、每日上限、置信度阈值、允许的回复类型等。',
    inputSchema: z.object({
      enabled: z.boolean().optional().describe('是否启用自动回复'),
      maxDailyAutoReplies: z
        .number()
        .optional()
        .describe('每日自动回复上限'),
      confidenceThreshold: z
        .number()
        .optional()
        .describe('置信度阈值（0-1）'),
      allowedReplyTypes: z
        .array(z.string())
        .optional()
        .describe('允许自动发送的回复类型'),
      requireReviewForLevel: z
        .array(z.string())
        .optional()
        .describe('需要人工审核的线索等级'),
      maxRepliesPerUser: z
        .number()
        .optional()
        .describe('每用户每日最大回复数'),
      quietHoursStart: z
        .string()
        .optional()
        .describe('静默期开始时间，如 "22:00"'),
      quietHoursEnd: z
        .string()
        .optional()
        .describe('静默期结束时间，如 "08:00"')
    }),
    execute: async (params, ctx) => {
      return apiCall(ctx)('/api/settings/auto-reply', {
        method: 'PUT',
        body: params
      });
    }
  },
  {
    name: 'review_pending_replies',
    description:
      '查看待审核的回复建议列表。这些是AI生成但需要人工确认的回复。',
    inputSchema: z.object({
      page: z.number().optional().default(1),
      limit: z.number().optional().default(10)
    }),
    execute: async ({ page, limit }, ctx) => {
      const query = new URLSearchParams({
        status: 'waiting_review',
        needReview: 'true',
        page: String(page),
        pageSize: String(limit)
      });
      return apiCall(ctx)(`/api/interactions?${query}`);
    }
  },
  {
    name: 'approve_reply',
    description: '批准一条待审核的回复建议，发送给用户。',
    inputSchema: z.object({
      suggestionId: z.string().describe('回复建议 ID'),
      action: z.enum(['approve', 'reject']).optional().default('approve')
    }),
    execute: async ({ suggestionId, action }, ctx) => {
      return apiCall(ctx)(`/api/reply-suggestions/${suggestionId}/review`, {
        method: 'POST',
        body: { action }
      });
    }
  },
  {
    name: 'search_video_comments',
    description:
      '在指定平台（默认抖音）搜索视频，浏览评论区，识别意向客户并分析意向度。会自动对每条评论进行AI分类，返回A/B级意向客户列表。',
    inputSchema: z.object({
      keyword: z.string().describe('搜索关键词，如"防晒霜推荐"、"护肤好物"'),
      platform: z
        .string()
        .optional()
        .default('douyin')
        .describe('平台名称，默认 douyin'),
      topNVideos: z
        .number()
        .optional()
        .default(5)
        .describe('搜索前几个视频的评论区，默认5'),
      maxCommentsPerVideo: z
        .number()
        .optional()
        .default(30)
        .describe('每个视频最多抓取评论数，默认30')
    }),
    execute: async (
      { keyword, platform, topNVideos, maxCommentsPerVideo },
      ctx
    ) => {
      return apiCall(ctx)('/api/prospecting/search', {
        method: 'POST',
        body: {
          keyword,
          platform: platform || 'douyin',
          topNVideos: topNVideos || 5,
          maxCommentsPerVideo: maxCommentsPerVideo || 30
        }
      });
    }
  }
];
