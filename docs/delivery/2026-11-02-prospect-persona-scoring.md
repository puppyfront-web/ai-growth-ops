# 2026-11-02 潜客画像语义评估与诚实降级交付记录

> 关联：[spec/39 SPEC](../../spec/39_潜客画像语义评估与诚实降级_SPEC.md)、[spec/40 Plan](../../spec/40_潜客画像语义评估_Plan.md)

## 背景（用户反馈与诊断）

用户反馈：AI 获客任务「帮我找一下关于企业或者工厂有AI需求的客户」增量执行后，高意向潜客全是同行或已做完 AI 落地的企业，不是「正在找 AI 落地服务的需求方」。

诊断证据（任务 `3ba8649a-5535-41fd-a503-d73b32dd6519`）：

| 日期 | 新增候选 | scoreSource | 质量 |
|---|---|---|---|
| 2026-10-18 | 94 | 93 skill / 1 rules | 良好（真需求问价/求助为主） |
| 2026-10-23 | 21 | 全部 rules | 误判（从业者定价吐槽 → A「咨询价格」） |
| 2026-11-02 | 26 | 全部 rules | 误判（同上 + 新闻搬运 → A） |

直接原因：组织 LLM（DeepSeek）**402 Insufficient Balance**，语义打分自 10-23 起静默失败并整体回退规则评分（`scripts/replay-prospect-scoring.ts` 真实调用复现：`status=failed error=402 Insufficient Balance`，~550ms 即失败）。三层缺陷：

1. 语义失败静默降级：仅 `console.warn`，任务元数据不记录、候选不标记；
2. 规则兜底无画像概念：「价格/报价/合作」关键词一律判 A；
3. 语义提示词无画像判定步骤：同行排除只覆盖「推广型卖方」，未覆盖「已落地企业」「从业者」。

## 改动

- **语义评估两步判定**：`packages/skills/definitions/prospect-relevance-score/SKILL.md` 重写——先判画像（`personaTag`：demand_seeker/peer_vendor/already_adopted/practitioner/job_seeker/irrelevant），仅需求方参与 A/B/C 评分，非需求方一律 D；输出 schema `personaTag` 必填枚举。
- **画像硬规则**：`packages/shared/src/prospect-scoring.ts` 新增 `PROSPECT_PERSONA_TAGS`、`mergeSemanticScore` 确定性硬规则（非 demand_seeker 画像强制 D、分数封顶 25、riskFlags 写画像原因）、`downgradeWithoutSemanticScore`（诚实降级纯函数）。
- **诚实降级接线**：`packages/database/src/prospecting.ts`——`scoreProspectsSemantically` 返回 `unavailableReason`（覆盖 402/超时/未配置全部失败）；语义缺失时规则分封顶 C 并追加「语义评估未完成：原因」riskFlag；任务 `metadata.semanticScoring={ok,error}` + 完成告警文案。
- **持久化与 API**：`ProspectCandidate.personaTag`（迁移 `20261102154203_prospect_persona_tag`，可空、空库重放通过）；候选列表 API 支持 `personaTag` 过滤（非法值 400）。
- **Web**：列表行/详情面板画像徽标（同行=红、需求方=绿）、详情风险提示（riskFlags 全量展示）、筛选栏「画像」下拉（URL 同步）；降级告警经 `metadata.warning` 既有通道透出。
- **计划生成需求侧约束**：`packages/database/src/prospecting-plan.ts` SYSTEM_PROMPT 增加三条查询设计规则（客户语言+求助问句优先 / 供给侧术语必须组合求助词 / 服务类 offering 必须生成供给方排除词）；矫正层对服务类 offering 且 exclusions 为空时兜底注入。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| shared 画像/降级单测 | `pnpm vitest run tests/unit/shared/prospect-scoring.test.ts` | 29/29 通过（新增 8 例先红后绿） |
| 计划生成单测 | `pnpm vitest run tests/unit/database/prospecting-plan.test.ts` | 7/7 通过（新增 3 例先红后绿） |
| 全量单元 | `pnpm test:unit` | 98 文件 / 647 测试全部通过 |
| Web | `pnpm test:web` | 27 文件 / 165 测试全部通过（新增画像徽标/筛选/风险提示 6 例） |
| 集成（新增） | `pnpm test:integration`（含 `tests/integration/api/prospecting-candidates-persona.test.ts`） | 新增 5/5 通过（过滤命中/总数/字段透传/非法 400） |
| 集成（全量） | 同上 | 6 文件 / 10 例失败，均为**既有失败**：platform-account-security、account-auth-expired 为 crm-release-status 已记录项；outreach×2、experiment-wiring、douyin-e2e 与本次改动调用路径无交集（本次仅触及获客打分/计划/API/Web，未动 outreach/账号权限/e2e 工作流） |
| typecheck / lint | `pnpm typecheck` / `pnpm lint` | 全部通过 |
| 迁移 | `pnpm db:reset:test`（e2e 库全量重放） | 全部迁移重放成功，`prospect_candidates.personaTag` 存在 |

## 真实验收（待环境恢复）

**阻塞项：组织 DeepSeek 账户余额不足（402）**，需在「集成配置 → LLM」充值或更换供应商。恢复后执行：

```bash
pnpm tsx --env-file=.env scripts/replay-prospect-scoring.ts 3ba8649a-5535-41fd-a503-d73b32dd6519 20
```

验收线（spec/39 AC-3）：11-02 批次误判为 A/B 的同行/从业者样本降为 D 比例 ≥ 80%；10-18 批次真需求样本误杀率 ≤ 10%。之后建议重建任务（需求描述聚焦「正在寻找/评估 AI 落地服务的人 + 明确排除同行/服务商/已落地/培训/求职」）并增量执行，人工抽查 A/B 级构成。

注意：修复生效后，若 LLM 仍不可用，任务会明确出现「语义评估未完成（原因）」告警且候选封顶 C 级——不再可能静默产出「A 级同行」。

## 遗留与风险

1. **DeepSeek 充值/换供应商**：用户操作，未完成前语义打分不可用（新行为：诚实降级 + 告警，不再误判）；
2. 回放验收线未执行（依赖上一项），执行后补充数据；
3. 历史 47 条误判候选（10-23/11-02 批次）不回填、不删除：无 personaTag，可用「画像」筛选隔离或按日期筛选人工复核；
4. 集成套件存在 8 例既有失败（outreach/experiment-wiring/douyin-e2e），建议单独排期排查，与本次改动无关；
5. 工作区另有他人未提交的小红书发布流改动（browser-runner douyin-publish/publish-routes/xhs-publish 等），本次未触碰。
