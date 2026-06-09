import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller, type AuthContext } from './_shared';

export function createContentMediaTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  return {
    generate_content_with_media: tool({
      description: '一键生成内容并自动配图。调用AI生成文案，同时生成配图素材，创建完整的内容条目。',
      inputSchema: z.object({
        topic: z.string().describe('内容主题'),
        contentType: z.enum(['text_image', 'video', 'article']).optional().default('text_image'),
        keywords: z.array(z.string()).optional().describe('关键词'),
        brandTone: z.string().optional().describe('品牌语调'),
        imageStyle: z.string().optional().describe('配图风格，如 "清新自然"、"科技感"、"生活化"'),
        imageCount: z.number().optional().default(1).describe('生成配图数量，1-3张'),
      }),
      execute: async (params) => {
        return apiCall('/api/content-items/generate-with-media', {
          method: 'POST',
          body: params,
        });
      },
    }),
  };
}
