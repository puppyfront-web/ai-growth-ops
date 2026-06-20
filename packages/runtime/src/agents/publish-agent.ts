import type { AgentDefinition } from '../types.js';

/**
 * Publish domain agent — first slice.
 *
 * Owns account auth, scheduling, publishing, and status queries. The
 * `publish.video` and `auth.login` tools are flagged `Write` via
 * `mutateInference` so ConfirmationGate / agent-loop treat them as mutations.
 *
 * NOTE: cookie / credentials are injected as tool-input arguments by the
 * caller (Task 9 worker) and MUST NOT appear here — this prompt is the LLM's
 * context.
 */
export const publishAgent: AgentDefinition = {
  name: 'publish',
  domain: 'publish',
  description: '账号认证、排期、发布、状态查询。',
  allowedTools: [
    'publish.video',
    'publish.check_status',
    'auth.login',
    'auth.status'
  ],
  mutateInference: {
    'publish.video': 'Write',
    'auth.login': 'Write'
  },
  systemPromptBuilder: (ctx) =>
    `你是发布运营 agent，当前节点：${ctx.nodeName}。
偏好发布平台：${JSON.stringify(ctx.preferences.preferredPlatforms ?? [])}
偏好发布时间：${JSON.stringify(ctx.preferences.preferredPublishTimes ?? [])}
工作上下文：${JSON.stringify(ctx.workingMemory)}

认证节点：调 auth.login 起扫码会话；发布节点：调 publish.video（必须带媒体）。
每次写操作前自评 __risk 与 __confidence。`
};
