import { tool } from 'ai';
import { z } from 'zod';
import { createApiCaller } from './_shared';
import type { AuthContext } from './_shared';

export function createWorkflowTools(auth: AuthContext) {
  const apiCall = createApiCaller(auth);

  return {
    create_workflow: tool({
      description: '创建自定义工作流。工作流是一系列步骤（skill/publish/sync等）的有序组合，可一键执行。',
      inputSchema: z.object({
        name: z.string().describe('工作流名称'),
        description: z.string().optional().describe('工作流描述'),
        steps: z.array(z.object({
          id: z.string().describe('步骤唯一标识'),
          type: z.enum(['skill', 'generate-media', 'platform-rewrite', 'publish', 'delay', 'sync-interactions', 'auto-reply', 'growth-review']),
          skillName: z.string().optional().describe('skill 类型步骤的技能名称'),
          input: z.record(z.unknown()).optional().describe('步骤输入参数'),
        })).describe('工作流步骤列表'),
        triggerConfig: z.record(z.unknown()).optional().describe('触发配置'),
      }),
      execute: async (params) => {
        return apiCall('/api/workflows', { method: 'POST', body: params });
      },
    }),

    create_workflow_from_template: tool({
      description: '从预置模板创建工作流。可选模板：full-loop(完整闭环), content-sprint(内容冲刺), engagement-sprint(互动冲刺)。',
      inputSchema: z.object({
        template: z.enum(['full-loop', 'content-sprint', 'engagement-sprint']).describe('模板名称'),
        name: z.string().optional().describe('自定义名称，不填则用模板默认名'),
      }),
      execute: async (params) => {
        return apiCall('/api/workflows/from-template', { method: 'POST', body: params });
      },
    }),

    list_workflows: tool({
      description: '列出所有工作流。',
      inputSchema: z.object({
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(10),
      }),
      execute: async ({ page, pageSize }) => {
        return apiCall(`/api/workflows?page=${page}&pageSize=${pageSize}`);
      },
    }),

    execute_workflow: tool({
      description: '执行一个工作流。工作流会按步骤顺序执行，支持多步骤编排。',
      inputSchema: z.object({
        workflowId: z.string().describe('工作流ID'),
      }),
      execute: async ({ workflowId }) => {
        return apiCall(`/api/workflows/${workflowId}/execute`, { method: 'POST' });
      },
    }),

    get_workflow_status: tool({
      description: '查看工作流状态和执行历史。',
      inputSchema: z.object({
        workflowId: z.string().describe('工作流ID'),
      }),
      execute: async ({ workflowId }) => {
        return apiCall(`/api/workflows/${workflowId}`);
      },
    }),

    pause_workflow: tool({
      description: '暂停工作流。',
      inputSchema: z.object({
        workflowId: z.string().describe('工作流ID'),
      }),
      execute: async ({ workflowId }) => {
        return apiCall(`/api/workflows/${workflowId}/pause`, { method: 'PATCH' });
      },
    }),
  };
}
