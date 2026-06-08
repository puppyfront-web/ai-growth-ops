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
  };
}
