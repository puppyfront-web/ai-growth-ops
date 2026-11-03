# Spec 47：评论/私信回复 AI 化与触达防护

## 背景

评论/私信获取同步（定时 30 分钟 + 手动）、回复建议与人工审核（`ReplySuggestion` 状态机）、自动回复频控（org 级 `auto_reply_config`：每日上限/静默时段/A 级强制人工）均已实现。剩余缺口：

1. 无用户级黑名单/退订机制（AGENTS.md 第 9 条红线：触达/回复必须有退订、黑名单、频控）。
2. AI 回复草稿质量不足：`interaction-pipeline` 仅通过 `lead-classification` skill 顺带生成建议，未注入客户画像、历史对话上下文，草稿泛化。
3. 真实回复未验收（能力矩阵中标"未验收"）。

## 目标

- G1：建立 `InteractionBlocklist`（用户级黑名单/退订），命中者不再进入分类/建议/自动回复/人工发送链路。
- G2：升级 AI 回复草稿：注入画像、历史互动摘要、品牌话术约束，产出场景化草稿；纯规则回退保留。
- G3：产出真实平台低量验收 Runbook 增补（评论回复 + 私信回复各一条），验收通过前 UI/文档保持"未验收"标识。

## 非目标

- 不做全平台自动回复放开；自动回复默认仍关闭。
- 不改动旧 Workflow/Campaign 链路。
- 不在验收阶段向真实平台批量发送（仅按批准模板低量）。

## 数据模型

`InteractionBlocklist`（新表）：
- `id String @id @default(uuid())`
- `organizationId String`（组织隔离，索引）
- `platform String`、`platformUserId String`（联合唯一 + organizationId）
- `reason String?`（manual / unsubscribe / complaint）
- `note String?`
- `blockedById String?`（操作人）
- `createdAt/updatedAt/deletedAt`，`metadata Json?`

领域服务：`blockInteractionTarget` / `unblockInteractionTarget` / `isInteractionTargetBlocked`（带组织隔离与软删除）。

## 行为变更

1. 同步入库后分类前：命中黑名单的 Interaction 标记 `metadata.blocklisted=true`，跳过分类/建议生成；已存在的 `waiting_review` 建议置为 `rejected(reason=blocklisted)`。
2. `manual-reply` / `auto-reply` 发送前强制检查黑名单，命中返回明确错误码（409 `BLOCKLISTED_TARGET`），不消耗发送配额。
3. API：`POST/GET/DELETE /api/interactions/blocklist`（权限 `lead:edit`；列表分页走 `parsePagination`）。
4. Web：评论/私信详情与审核页展示"加入黑名单"操作（L2 确认），命中黑名单的条目显示标签且发送按钮禁用并说明原因。
5. AI 草稿：`reply-draft` skill（packages/skills 新增 prompt + runner 接线），输入为互动内容 + 画像摘要 + 最近 5 条历史互动 + 品牌话术配置（AppConfig `reply_style_config`），失败回退现有规则模板。
6. `unsubscribe` 关键词规则：私信中出现明确退订意图（"退订"/"不要再发"等）时自动加入黑名单（reason=unsubscribe）并写 AuditLog。

## API

见行为变更 3；所有路由走 `getOrganizationContext` + `hasPermission`，统一 `sendJson` 响应。

## 测试矩阵

- 单元（packages/shared 或 database service）：黑名单去重、软删除恢复、组织隔离、退订关键词判定。
- 集成（tests/integration/api）：blocklist CRUD 401/403/404/409/成功；命中黑名单后 reply 返回 409；auto-reply 跳过。
- 单元（worker）：pipeline 命中黑名单跳过建议、waiting_review 自动 rejected；AI 失败回退规则模板。
- Web 单元：黑名单标签、禁用发送按钮、L2 确认弹层。

## 验收标准

- [ ] `pnpm typecheck && pnpm lint && pnpm test` 全绿，新增测试先红后绿。
- [ ] 迁移空库可重放，`prisma migrate diff` 无漂移。
- [ ] 命中黑名单的完整拒绝路径有集成测试证据。
- [ ] Runbook 增补 + 能力矩阵更新（真实回复仍标未验收直到真实验收完成）。
