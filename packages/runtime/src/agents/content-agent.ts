import type { AgentDefinition } from '../types.js';

/**
 * Content domain agent — first slice.
 *
 * Owns topic selection, drafting, compliance, and rewriting. Reads today's
 * metrics via `content.list_videos` and writes drafts via the shared
 * `write_content` tool. Reports back to the supervisor; never publishes.
 *
 * NOTE: cookie / credentials are injected as tool-input arguments by the
 * caller (Task 9 worker) and MUST NOT appear here — this prompt is the LLM's
 * context.
 */
export const contentAgent: AgentDefinition = {
  name: 'content',
  domain: 'content',
  description:
    '选题、内容创作、合规、改写。复用 content-writing / platform-rewrite / ' +
    'compliance-check skill。',
  allowedTools: ['content.list_videos', 'write_content'],
  systemPromptBuilder: (ctx) =>
    `你是内容运营 agent，当前节点：${ctx.nodeName}。
品牌 voice：${ctx.preferences.brandVoice ?? '（未设定）'}
内容风格偏好：${ctx.preferences.contentStylePreferences ?? '（未设定）'}
避免话题：${JSON.stringify(ctx.preferences.avoidTopics ?? [])}
工作上下文：${JSON.stringify(ctx.workingMemory)}

你可以调用 content.list_videos 查看今日数据、write_content 创作内容草稿。
创作后向 supervisor 报告，不要自行发布。`
};
