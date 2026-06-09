import { tool } from 'ai';
import { z } from 'zod';
import type { AuthContext } from './_shared';
import { listPlanTemplates } from '../plan-templates';

export function createAgentTools(auth: AuthContext) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${auth.token}`,
    'x-organization-id': auth.orgId,
  };

  async function apiCall(path: string, options: { method?: string; body?: unknown } = {}) {
    const { method = 'GET', body } = options;
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  }

  return {
    // ── Proactive Suggestions ─────────────────────────────────────
    get_proactive_suggestions: tool({
      description: '获取基于当前运营数据的主动建议。在对话开始时或用户问"我该做什么"时调用。',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await apiCall('/api/agent/suggestions');
        return result;
      },
    }),

    // ── User Preferences ──────────────────────────────────────────
    get_my_preferences: tool({
      description: '获取用户的运营偏好设置（常用平台、内容风格、品牌调性等）。',
      inputSchema: z.object({}),
      execute: async () => {
        return await apiCall('/api/settings/agent-preferences');
      },
    }),

    remember_preference: tool({
      description: '记住用户的一个偏好设置。用户说"记住..."、"以后都用..."、"我喜欢..."时调用。',
      inputSchema: z.object({
        key: z.enum([
          'preferredPlatforms',
          'defaultContentType',
          'preferredPublishTimes',
          'contentStylePreferences',
          'replyStylePreferences',
          'avoidTopics',
          'brandVoice',
        ]).describe('偏好键名'),
        value: z.union([z.string(), z.array(z.string())]).describe('偏好值'),
      }),
      execute: async ({ key, value }) => {
        const current = await apiCall('/api/settings/agent-preferences') as Record<string, unknown>;
        current[key] = value;
        await apiCall('/api/settings/agent-preferences', { method: 'PUT', body: current });
        return { ok: true, message: `已记住: ${key} = ${JSON.stringify(value)}` };
      },
    }),

    // ── Plan Templates ────────────────────────────────────────────
    list_plan_templates: tool({
      description: '列出可用的多步骤执行计划模板。用户要求执行完整流程时先展示可选模板。',
      inputSchema: z.object({}),
      execute: async () => {
        return { templates: listPlanTemplates() };
      },
    }),

    // ── Execute Plan ──────────────────────────────────────────────
    execute_plan: tool({
      description: '执行多步骤运营计划。用户要求"帮我从创作到发布全搞定"、"执行完整闭环"等复合任务时使用。你可以直接定义步骤或从模板加载。',
      inputSchema: z.object({
        planName: z.string().describe('计划名称'),
        steps: z.array(z.object({
          toolName: z.string().describe('要调用的工具名'),
          description: z.string().describe('这一步做什么'),
          params: z.record(z.unknown()).optional().describe('工具参数'),
        })).describe('执行步骤列表'),
      }),
      execute: async ({ planName, steps }) => {
        // Return plan info so the AI can execute steps one by one
        // using maxSteps to call each tool sequentially
        return {
          planStarted: true,
          planName,
          totalSteps: steps.length,
          steps: steps.map((s, i) => ({
            index: i + 1,
            toolName: s.toolName,
            description: s.description,
            params: s.params || {},
          })),
          instruction: `计划"${planName}"已创建，共${steps.length}步。请依次调用每个工具执行。`,
        };
      },
    }),
  };
}
