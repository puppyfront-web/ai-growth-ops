import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller } from './_shared';
import type { AuthContext } from './_shared';

export function createCampaignTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  return {
    create_campaign: tool({
      description: '创建内容运营活动。可设置主题、平台、发布频率等。活动激活后会自动生成内容并发布。',
      inputSchema: z.object({
        name: z.string().describe('活动名称'),
        platforms: z.array(z.string()).describe('目标平台列表，如 ["douyin", "xiaohongshu"]'),
        topic: z.string().describe('内容主题'),
        contentType: z.enum(['text_image', 'video', 'article']).optional().default('text_image'),
        keywords: z.array(z.string()).optional().describe('关键词列表'),
        brandTone: z.string().optional().describe('品牌语调'),
        imageStyle: z.string().optional().describe('配图风格'),
        scheduleFrequency: z.string().optional().describe('发布频率，如 "3/week"'),
        scheduleDays: z.array(z.string()).optional().describe('发布日，如 ["mon","wed","fri"]'),
        scheduleTime: z.string().optional().describe('发布时间，如 "09:00"'),
        autoPublish: z.boolean().optional().default(true),
      }),
      execute: async (params) => {
        return apiCall('/api/campaigns', {
          method: 'POST',
          body: {
            name: params.name,
            platforms: params.platforms,
            contentType: params.contentType,
            topicConfig: {
              topic: params.topic,
              keywords: params.keywords,
              brandTone: params.brandTone,
              imageStyle: params.imageStyle,
            },
            scheduleConfig: (params.scheduleFrequency || params.scheduleDays) ? {
              frequency: params.scheduleFrequency,
              days: params.scheduleDays,
              time: params.scheduleTime,
            } : undefined,
            autoPublish: params.autoPublish,
          },
        });
      },
    }),

    list_campaigns: tool({
      description: '列出所有内容运营活动。可按状态筛选。',
      inputSchema: z.object({
        status: z.string().optional().describe('筛选状态：draft/active/paused/completed'),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(10),
      }),
      execute: async ({ status, page, limit }) => {
        const query = new URLSearchParams();
        if (status) query.set('status', status);
        query.set('page', String(page));
        query.set('limit', String(limit));
        return apiCall(`/api/campaigns?${query}`);
      },
    }),

    get_campaign_detail: tool({
      description: '查看运营活动详情，包括执行历史和状态。',
      inputSchema: z.object({
        campaignId: z.string().describe('活动ID'),
      }),
      execute: async ({ campaignId }) => {
        return apiCall(`/api/campaigns/${campaignId}`);
      },
    }),

    start_campaign: tool({
      description: '启动运营活动。活动将按照设定的频率自动生成和发布内容。',
      inputSchema: z.object({
        campaignId: z.string().describe('活动ID'),
      }),
      execute: async ({ campaignId }) => {
        return apiCall(`/api/campaigns/${campaignId}/start`, { method: 'PATCH' });
      },
    }),

    pause_campaign: tool({
      description: '暂停运营活动。已排队的执行会继续完成。',
      inputSchema: z.object({
        campaignId: z.string().describe('活动ID'),
      }),
      execute: async ({ campaignId }) => {
        return apiCall(`/api/campaigns/${campaignId}/pause`, { method: 'PATCH' });
      },
    }),

    trigger_campaign_run: tool({
      description: '立即触发一次运营活动执行，不等待定时计划。',
      inputSchema: z.object({
        campaignId: z.string().describe('活动ID'),
      }),
      execute: async ({ campaignId }) => {
        return apiCall(`/api/campaigns/${campaignId}/run-now`, { method: 'POST' });
      },
    }),
  };
}
