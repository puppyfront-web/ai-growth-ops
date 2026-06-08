import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller, type AuthContext } from './_shared';

export function createContentTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  const listContent = tool({
    description: '列出组织内所有内容。支持分页。',
    parameters: z.object({
      page: z.number().optional().describe('页码，默认 1'),
      pageSize: z.number().optional().describe('每页数量，默认 20'),
    }),
    execute: async ({ page, pageSize }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (pageSize) params.set('pageSize', String(pageSize));
      const qs = params.toString();
      return apiCall(`/api/content-items${qs ? `?${qs}` : ''}`);
    },
  });

  const getContentDetail = tool({
    description: '获取内容详情，包括所有平台变体和合规状态。',
    parameters: z.object({
      contentId: z.string().describe('内容 ID'),
    }),
    execute: async ({ contentId }) => {
      return apiCall(`/api/content-items/${contentId}`);
    },
  });

  const writeContent = tool({
    description: '使用 AI 创建新内容。返回内容 ID 供后续合规检查、改写和发布。',
    parameters: z.object({
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

  const checkCompliance = tool({
    description: '使用 AI 合规检查技能检查内容。识别敏感词、夸张宣传、联系方式泄露等风险。',
    parameters: z.object({
      contentId: z.string().describe('要检查的内容 ID'),
    }),
    execute: async ({ contentId }) => {
      return apiCall(`/api/content-items/${contentId}/compliance-check`, {
        method: 'POST',
      });
    },
  });

  const rewriteForPlatform = tool({
    description: '使用 AI 平台改写技能为内容生成平台专属变体。自动适配抖音、小红书等不同平台风格。',
    parameters: z.object({
      contentId: z.string().describe('要改写的内容 ID'),
      platforms: z.array(z.string()).optional().describe('目标平台列表，如 ["douyin","xiaohongshu"]。不传则生成所有平台变体'),
    }),
    execute: async ({ contentId, platforms }) => {
      return apiCall(`/api/content-items/${contentId}/generate-variants`, {
        method: 'POST',
        body: { platforms: platforms || undefined },
      });
    },
  });

  const approveVariant = tool({
    description: '批准内容变体，使其可用于创建发布任务。变体通过合规检查后方可批准。',
    parameters: z.object({
      variantId: z.string().describe('要批准的变体 ID'),
    }),
    execute: async ({ variantId }) => {
      return apiCall(`/api/content-variants/${variantId}/approve`, {
        method: 'PATCH',
      });
    },
  });

  return {
    list_content: listContent,
    get_content_detail: getContentDetail,
    write_content: writeContent,
    check_compliance: checkCompliance,
    rewrite_for_platform: rewriteForPlatform,
    approve_variant: approveVariant,
  };
}
