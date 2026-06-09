import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller, type AuthContext } from './_shared';

export function createResearchTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  const runResearch = tool({
    description: '创建并执行调研任务。跨平台搜索关键词，生成洞察和内容机会。可能需要 30 秒以上完成。',
    inputSchema: z.object({
      keywords: z.array(z.string()).describe('调研关键词列表'),
      platforms: z.array(z.string()).optional().describe('调研平台列表，如 ["douyin","xiaohongshu"]'),
      type: z.string().optional().describe('调研类型，默认 keyword_search'),
    }),
    execute: async ({ keywords, platforms, type }) => {
      const task = await apiCall('/api/research-tasks', {
        method: 'POST',
        body: {
          keywords,
          platforms: platforms || ['douyin', 'xiaohongshu'],
          type: type || 'keyword_search',
        },
      });
      const taskId = (task as { id: string }).id;
      try {
        const result = await apiCall(`/api/research-tasks/${taskId}/run`, {
          method: 'POST',
        });
        return { task, result };
      } catch (err) {
        return { task, error: `调研任务已创建(${taskId})但执行失败: ${(err as Error).message}。可稍后用 get_research_insights 查看结果` };
      }
    },
  });

  const getResearchInsights = tool({
    description: '查看调研洞察和内容机会。可查看指定任务的详细结果，或所有任务的洞察汇总。',
    inputSchema: z.object({
      taskId: z.string().optional().describe('指定任务 ID。不传则返回所有洞察汇总'),
    }),
    execute: async ({ taskId }) => {
      if (taskId) {
        return apiCall(`/api/research-tasks/${taskId}`);
      }
      const [insights, opportunities] = await Promise.all([
        apiCall('/api/research-insights').catch(() => []),
        apiCall('/api/content-opportunities').catch(() => []),
      ]);
      return { insights, opportunities };
    },
  });

  const listLeads = tool({
    description: '查看线索列表。支持按等级和状态筛选。',
    inputSchema: z.object({
      level: z.enum(['A', 'B', 'C', 'D']).optional().describe('线索等级筛选'),
      status: z.string().optional().describe('状态筛选'),
      page: z.number().optional().describe('页码'),
      pageSize: z.number().optional().describe('每页数量'),
    }),
    execute: async ({ level, status, page, pageSize }) => {
      const params = new URLSearchParams();
      if (level) params.set('level', level);
      if (status) params.set('status', status);
      if (page) params.set('page', String(page));
      if (pageSize) params.set('pageSize', String(pageSize));
      const qs = params.toString();
      return apiCall(`/api/leads${qs ? `?${qs}` : ''}`);
    },
  });

  const syncLeadToFeishu = tool({
    description: '将线索同步到飞书多维表格。需要先配置飞书集成。',
    inputSchema: z.object({
      leadId: z.string().describe('线索 ID'),
    }),
    execute: async ({ leadId }) => {
      return apiCall(`/api/leads/${leadId}/sync-feishu`, {
        method: 'POST',
      });
    },
  });

  const syncLeadToWecom = tool({
    description: '将线索同步到企业微信通讯录。需要先配置企业微信集成。',
    inputSchema: z.object({
      leadId: z.string().describe('线索 ID'),
    }),
    execute: async ({ leadId }) => {
      return apiCall(`/api/leads/${leadId}/sync-wecom`, {
        method: 'POST',
      });
    },
  });

  const getAnalytics = tool({
    description: '查看数据分析概览，包括内容表现、互动数据、线索转化等关键指标。',
    inputSchema: z.object({
      period: z.string().optional().describe('时间范围：7d | 30d | 90d，默认 30d'),
    }),
    execute: async ({ period }) => {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      const qs = params.toString();
      return apiCall(`/api/analytics/overview${qs ? `?${qs}` : ''}`);
    },
  });

  return {
    run_research: runResearch,
    get_research_insights: getResearchInsights,
    list_leads: listLeads,
    sync_lead_to_feishu: syncLeadToFeishu,
    sync_lead_to_wecom: syncLeadToWecom,
    get_analytics: getAnalytics,
    get_engagement_metrics: tool({
      description: '查看互动参与度分析。包括各平台互动量、回复率、线索转化率、分类置信度等。',
      inputSchema: z.object({
        days: z.number().optional().default(7).describe('统计天数，默认7天'),
      }),
      execute: async ({ days }) => {
        return apiCall(`/api/analytics/engagement?days=${days}`);
      },
    }),
    get_content_performance: tool({
      description: '查看各内容的运营表现排名。按互动量、线索数、回复数综合评分。',
      inputSchema: z.object({
        days: z.number().optional().default(30).describe('统计天数，默认30天'),
      }),
      execute: async ({ days }) => {
        return apiCall(`/api/analytics/content-performance?days=${days}`);
      },
    }),
  };
}
