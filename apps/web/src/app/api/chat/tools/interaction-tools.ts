import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller, type AuthContext } from './_shared';

export function createInteractionTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  const syncMessages = tool({
    description: '从指定平台同步最新评论或私信。通过浏览器自动化拉取，返回同步任务 ID。',
    parameters: z.object({
      platform: z.string().describe('平台名称，如 douyin, xiaohongshu'),
      platformAccountId: z.string().describe('平台账号 ID'),
      syncType: z.enum(['comments', 'messages', 'all']).optional().describe('同步类型：comments=评论, messages=私信, all=全部。默认 all'),
    }),
    execute: async ({ platform, platformAccountId, syncType }) => {
      const type = syncType || 'all';
      if (type === 'all') {
        const [comments, messages] = await Promise.all([
          apiCall('/api/interactions/sync', {
            method: 'POST',
            body: { platform, platformAccountId, syncType: 'comments' },
          }).catch(() => null),
          apiCall('/api/interactions/sync', {
            method: 'POST',
            body: { platform, platformAccountId, syncType: 'messages' },
          }).catch(() => null),
        ]);
        return { comments, messages };
      }
      return apiCall('/api/interactions/sync', {
        method: 'POST',
        body: { platform, platformAccountId, syncType: type },
      });
    },
  });

  const listInteractions = tool({
    description: '查看最近的评论和私信。支持按平台、状态、类型筛选。',
    parameters: z.object({
      platform: z.string().optional().describe('筛选平台'),
      status: z.string().optional().describe('筛选状态：NEW | CLASSIFIED | REPLIED | IGNORED'),
      type: z.string().optional().describe('筛选类型：comment | message'),
      page: z.number().optional().describe('页码'),
      pageSize: z.number().optional().describe('每页数量'),
    }),
    execute: async ({ platform, status, type, page, pageSize }) => {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (page) params.set('page', String(page));
      if (pageSize) params.set('pageSize', String(pageSize));
      const qs = params.toString();
      return apiCall(`/api/interactions${qs ? `?${qs}` : ''}`);
    },
  });

  const classifyInteraction = tool({
    description: '使用 AI 线索分类技能对互动进行分类。返回意图类型、线索等级(A/B/C/D)、置信度和风险等级。',
    parameters: z.object({
      interactionId: z.string().describe('互动 ID'),
    }),
    execute: async ({ interactionId }) => {
      return apiCall(`/api/interactions/${interactionId}/classify`, {
        method: 'POST',
      });
    },
  });

  const suggestReply = tool({
    description: '使用 AI 回复建议技能生成回复建议。根据互动内容和分类结果智能推荐回复文本。',
    parameters: z.object({
      interactionId: z.string().describe('互动 ID'),
    }),
    execute: async ({ interactionId }) => {
      return apiCall(`/api/interactions/${interactionId}/suggest-reply`, {
        method: 'POST',
      });
    },
  });

  const replyToInteraction = tool({
    description: '回复一条评论或私信。通过浏览器自动化发布回复。高风险互动需要人工确认。',
    parameters: z.object({
      interactionId: z.string().describe('要回复的互动 ID'),
      content: z.string().describe('回复内容'),
    }),
    execute: async ({ interactionId, content }) => {
      return apiCall(`/api/interactions/${interactionId}/reply`, {
        method: 'POST',
        body: { content },
      });
    },
  });

  const convertToLead = tool({
    description: '将已分类的互动转化为线索。创建线索记录，可后续同步到飞书或企业微信。',
    parameters: z.object({
      interactionId: z.string().describe('要转化的互动 ID'),
    }),
    execute: async ({ interactionId }) => {
      return apiCall(`/api/interactions/${interactionId}/convert-to-lead`, {
        method: 'POST',
      });
    },
  });

  return {
    sync_comments: tool({
      description: '从指定平台拉取最新评论（快捷方式）',
      parameters: z.object({
        platform: z.string().describe('平台名称，如 douyin'),
        platformAccountId: z.string().describe('平台账号 ID'),
        limit: z.number().optional().describe('拉取数量，默认 50'),
      }),
      execute: async ({ platform, platformAccountId, limit }) => {
        return apiCall('/api/interactions/sync', {
          method: 'POST',
          body: { platform, platformAccountId, syncType: 'comments', limit: limit || 50 },
        });
      },
    }),
    sync_messages: syncMessages,
    list_interactions: listInteractions,
    classify_interaction: classifyInteraction,
    suggest_reply: suggestReply,
    reply_to_interaction: replyToInteraction,
    convert_to_lead: convertToLead,
    get_auto_reply_config: tool({
      description: '查看自动回复配置。包括是否启用、每日上限、置信度阈值、允许的回复类型等。',
      parameters: z.object({}),
      execute: async () => {
        return apiCall('/api/settings/auto-reply');
      },
    }),
    update_auto_reply_config: tool({
      description: '更新自动回复配置。可修改启用状态、每日上限、置信度阈值、允许的回复类型等。',
      parameters: z.object({
        enabled: z.boolean().optional().describe('是否启用自动回复'),
        maxDailyAutoReplies: z.number().optional().describe('每日自动回复上限'),
        confidenceThreshold: z.number().optional().describe('置信度阈值（0-1）'),
        allowedReplyTypes: z.array(z.string()).optional().describe('允许自动发送的回复类型'),
        requireReviewForLevel: z.array(z.string()).optional().describe('需要人工审核的线索等级'),
        maxRepliesPerUser: z.number().optional().describe('每用户每日最大回复数'),
        quietHoursStart: z.string().optional().describe('静默期开始时间，如 "22:00"'),
        quietHoursEnd: z.string().optional().describe('静默期结束时间，如 "08:00"'),
      }),
      execute: async (params) => {
        return apiCall('/api/settings/auto-reply', { method: 'PUT', body: params });
      },
    }),
    review_pending_replies: tool({
      description: '查看待审核的回复建议列表。这些是AI生成但需要人工确认的回复。',
      parameters: z.object({
        page: z.number().optional().default(1),
        limit: z.number().optional().default(10),
      }),
      execute: async ({ page, limit }) => {
        const query = new URLSearchParams({
          status: 'waiting_review',
          needReview: 'true',
          page: String(page),
          pageSize: String(limit),
        });
        return apiCall(`/api/interactions?${query}`);
      },
    }),
    approve_reply: tool({
      description: '批准一条待审核的回复建议，发送给用户。',
      parameters: z.object({
        suggestionId: z.string().describe('回复建议 ID'),
        action: z.enum(['approve', 'reject']).optional().default('approve'),
      }),
      execute: async ({ suggestionId, action }) => {
        return apiCall(`/api/reply-suggestions/${suggestionId}/review`, {
          method: 'POST',
          body: { action },
        });
      },
    }),
    search_video_comments: tool({
      description: '在指定平台（默认抖音）搜索视频，浏览评论区，识别意向客户并分析意向度。会自动对每条评论进行AI分类，返回A/B级意向客户列表。',
      parameters: z.object({
        keyword: z.string().describe('搜索关键词，如"防晒霜推荐"、"护肤好物"'),
        platform: z.string().optional().default('douyin').describe('平台名称，默认 douyin'),
        topNVideos: z.number().optional().default(5).describe('搜索前几个视频的评论区，默认5'),
        maxCommentsPerVideo: z.number().optional().default(30).describe('每个视频最多抓取评论数，默认30'),
      }),
      execute: async ({ keyword, platform, topNVideos, maxCommentsPerVideo }) => {
        return apiCall('/api/prospecting/search', {
          method: 'POST',
          body: { keyword, platform: platform || 'douyin', topNVideos: topNVideos || 5, maxCommentsPerVideo: maxCommentsPerVideo || 30 },
        });
      },
    }),
  };
}
