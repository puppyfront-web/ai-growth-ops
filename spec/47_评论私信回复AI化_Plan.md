# Plan 47：评论/私信回复 AI 化与触达防护

依据 Spec 47。任务并行策略：A/B/D 并发（文件域不相交），A 完成后由主会话完成 pipeline 汇总接线（避免对 `interaction-pipeline.ts` 的并发编辑）。

## Task A：黑名单/退订机制（并发，占 schema/routes/pipeline/web 域）

- 文件：`packages/database/prisma/schema.prisma`（新表 + 迁移）、`packages/database/src/interaction-blocklist.ts`（新）、`apps/api/src/routes.ts`（blocklist 路由）、`apps/worker/src/job-handlers/interaction-pipeline.ts`（黑名单守卫）、`interaction.auto-reply.ts` / `interaction.manual-reply.ts`（发送前检查）、Web conversations 页面。
- 先写失败测试：`tests/unit/database/interaction-blocklist.test.ts`、`tests/integration/api/interaction-blocklist.test.ts`、worker 单测、web 单测。
- 验收：scoped 测试全绿 + `pnpm typecheck` + `pnpm lint`；迁移空库重放检查。

## Task B：AI 回复草稿 skill（并发，仅 packages/skills + 测试域）

- 文件：`packages/skills`（reply-draft prompt 与 runner）、`packages/shared`（上下文构建纯函数 buildReplyDraftContext）、单元测试。
- 不改 `interaction-pipeline.ts`（由主会话在 A 完成后接线）。
- 验收：skill 单测覆盖画像注入/历史摘要/退订回退/LLM 失败回退规则模板。

## Task C：pipeline 汇总接线（依赖 A、B）

- 主会话执行：pipeline 调用 reply-draft skill（AI 优先、规则回退），与黑名单守卫合并；跑全量 `pnpm test`。

## Task D：验收 Runbook 增补 + 能力矩阵（并发，仅 docs 域）

- 文件：`docs/delivery/real-platform-acceptance-runbook.md`（评论回复 + 私信回复低量验收模板）、`docs/delivery/crm-release-status.md`。
- 验收：文档引用证据格式与现有 runbook 一致。

## 风险

- A 与 B 并发编辑冲突：通过文件域隔离规避；C 统一收口。
- 真实平台验收需用户账号配合，不在本计划代码任务内完成。
