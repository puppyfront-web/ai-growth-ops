# 39. 潜客画像语义评估与诚实降级 SPEC

> 状态：已实施（2026-11-02）
> 关联：[16_获客搜索零结果诊断](./16_获客搜索零结果诊断_SPEC.md)、[31_智能获客多账号执行](./31_智能获客多账号执行_SPEC.md)、[35_潜客列表日期筛选](./35_潜客列表日期筛选与默认倒序_SPEC.md)
> 背景：用户反馈「增量执行后高意向潜客全是同行或已做完 AI 落地的企业，要的是正在找 AI 落地服务的需求方」。

## 1. 背景（诊断证据）

任务 `3ba8649a`（需求「帮我找一下关于企业或者工厂有AI需求的客户」）：

| 日期 | 新增候选 | scoreSource |
|---|---|---|
| 2026-10-18 | 94 | 93 skill / 1 rules（质量良好：如「我们产线包装环节易出错…可以帮我们避免」） |
| 2026-10-23 | 21 | 全部 rules |
| 2026-11-02 | 26 | 全部 rules（今日增量，用户看到的误判批次） |

诊断脚本 `scripts/replay-prospect-scoring.ts` 真实调用组织 LLM 复现：`status=failed error=402 Insufficient Balance`（DeepSeek 余额不足，567ms 即失败）。三层缺陷：

1. **语义失败静默降级**：skill 调用失败仅 `console.warn`（进程终端丢失即不可见），任务 metadata 不记录、候选不标记，直接按规则分入 A 级——违反设计文档《2026-09-23-intent-driven-prospecting-design.md》§10「模型失败时…结果必须标记未完成语义评估，不能把召回结果直接当作合格潜客」。
2. **规则兜底无画像概念**：`classifyByRules` 把含「价格/报价/合作」的评论一律判为咨询意向 A（例：「甲方知道了，会不会压低报价？」→ A「用户咨询价格/购买渠道」，实为软件从业者吐槽定价内卷；「中国中小企业服务网发布采购智能体与工厂智能体」→ A，实为新闻搬运）。
3. **语义提示词无画像判定**：`prospect-relevance-score/SKILL.md` 按话题相关度+购买信号打分；同行排除仅覆盖「推广自己产品的卖方」，未覆盖「已落地企业分享经验」「从业者聊技术」「课程/资源引流」「求职者」。已落地企业话题相关度、证据质量反而最高，稳定获得 A/B。

## 2. 目标与非目标

### 2.1 目标

- G1 语义评估改为**两步判定**：先判评论者画像 `personaTag`，仅「需求方」参与 A/B/C 评分；画像输出为可解释结构化字段并全链路透传。
- G2 `mergeSemanticScore` 确定性硬规则：`peer_vendor` / `already_adopted` / `job_seeker` 画像 → 强制 `leadLevel: 'D'`（LLM 打分再高也压下），与现有 `sellerSignal` 同等地位。
- G3 `ProspectCandidate` 新增 `personaTag`（可空字符串），候选列表 API 支持 `personaTag` 过滤，Web 列表/详情展示画像标签、筛选栏新增画像筛选。
- G4 **诚实降级**：语义打分失败/未配置时（含 402 余额类错误）——该批次候选 `leadLevel` 封顶 `C`、`riskFlags` 追加「语义评估未完成（原因）」、任务 `metadata.semanticScoring` 记录 `{ ok, error }`，Web 任务详情展示告警。规则分永远不能再产出「A 级同行」。
- G5 计划生成提示词增加**需求侧查询约束**：查询必须用目标客户语言（业务痛点词 + 求助/比较/价格问句）；供给侧术语仅可用于 `purchase_evaluation` 且必须组合求助词；服务类 offering 的 `intent.exclusions` 必须包含同行/服务商/代理/培训排除词。

### 2.2 非目标

- 不做规则引擎的语义画像识别（规则兜底只做降级封顶，不猜画像）；
- 不改候选列表默认排序/默认筛选（沿用 35 号 spec 行为）；
- 不做自动重试充值/自动切换 LLM 供应商；
- 不向历史候选回填 personaTag（历史数据保留原样，靠新批次增量修复）。

## 3. 数据模型

`ProspectCandidate` 新增列：

```prisma
personaTag String?   // demand_seeker | peer_vendor | already_adopted | practitioner | job_seeker | irrelevant
```

可空、无默认值；迁移仅 `ALTER TABLE ... ADD COLUMN`（可重放）。老行为 `null` 表示「未做画像判定」（含全部历史数据）。

## 4. 语义评估契约（skill）

输入不变（requirement / intent / searchQueries / highIntentKeywords / users[]）。输出 `results[]` 每项新增必填 `personaTag`（枚举同上）。SKILL.md 改为两步判定：

1. **画像判定**（依据：评论人称与语气「我们想/我们打算」vs「我们做了/我们提供」、是否求助提问 vs 经验陈述/推广、昵称签名话术、视频标题语境）：
   - `demand_seeker` 正在寻找/评估/计划引入所售服务的人（含问价、求推荐、求方案、吐槽现有人工/流程想改进）；
   - `peer_vendor` 服务商/开发商/代理商/培训方/课程引流（含软性案例宣传）；
   - `already_adopted` 已接入/已落地，分享经验或讨论效果（无新采购需求）；
   - `practitioner` 从业者/技术爱好者，聊技术不求方案；
   - `job_seeker` 求职者；
   - `irrelevant` 无法判断或无关。
2. **评分**：仅 `demand_seeker` 输出 A/B/C 与四维分；`peer_vendor` / `already_adopted` / `job_seeker` / `practitioner` 输出 `D` + 低分 + riskFlags 中文原因；`irrelevant` 为 D。

## 5. 合并逻辑（packages/shared）

`SemanticScore` 增加可选 `personaTag`；`mergeSemanticScore` 透传，并新增硬规则（先于现有 sellerSignal 规则）：

- 语义 `personaTag ∈ {peer_vendor, already_adopted, practitioner, job_seeker, irrelevant}`（即一切非 `demand_seeker` 画像）→ `leadLevel='D'`、score ≤ 25、riskFlags 含中文画像原因；规则侧 sellerSignal 仍保留最终否决权。

## 6. 诚实降级（packages/database + Web）

- `scoreProspectsSemantically` 返回值增加 `unavailableReason`（首个失败原因摘要，如「402 Insufficient Balance」）；`LLM_NOT_CONFIGURED` 之外的所有 `status=failed` 也计入。
- `executeProspectingTask`：候选无语义分且语义不可用 → `leadLevel` 封顶 `C`（A/B 降为 C）、riskFlags 追加 `语义评估未完成：{reason}`；任务完成时 `metadata.semanticScoring = { ok, error? }`。
- Web 任务详情：`metadata.semanticScoring.ok === false` 时展示黄色告警条「本轮语义评分未完成（原因），相关结果已按规则评分并封顶 C 级」。

## 7. API

`prospectCandidateQuerySchema` 新增 `personaTag: z.enum([...6值]).optional()`；路由 where `personaTag` 等值过滤。响应项携带 `personaTag`。

## 8. UI

- `ProspectListRow`：leadLevel 徽标旁展示画像标签（需求方=绿/同行服务商=红/已落地=灰/从业者=灰/求职者=灰/无关=灰；`null` 不展示）。
- `ProspectFilterBar`：意向等级之后新增「画像」下拉（全部/需求方/同行服务商/已落地/从业者/求职者/无关），进 URL 同步与重置。
- `ProspectDetailPanel`：展示画像标签与完整 riskFlags。

## 9. 测试矩阵

| 层 | 用例 |
|---|---|
| shared 单测 | mergeSemanticScore：personaTag 三类强制 D 且分数封顶；demand_seeker 透传；sellerSignal 与 personaTag 同时命中共存；非法 personaTag 忽略 |
| skill schema | 输出 schema 含 personaTag 枚举必填（现有 schema 校验测试回归） |
| database 单测 | 诚实降级：语义不可用时 A 级规则分降为 C、riskFlags 标记；metadata 记录原因（通过 prospect-intent/merge 相关测试模式） |
| integration API | personaTag 过滤参数（等值命中/不命中/非法 400）；组织隔离沿用 |
| web 单测 | 列表行画像标签渲染；筛选栏画像选项同步；告警条在 semanticScoring.ok=false 时展示 |
| 计划提示词 | compileProspectingPlan 输出矫正层对 exclusions 缺失服务类排除词的兜底（切片2） |

## 10. 验收标准

- AC-1 单测/集成全绿，`pnpm typecheck` + `pnpm lint` 通过；
- AC-2 迁移空库可重放，`prisma migrate diff` 无漂移；
- AC-3 回放验收（依赖组织 LLM 恢复可用，如 DeepSeek 充值）：用 `scripts/replay-prospect-scoring.ts` 对 11-02 批次重打分，被误判 A/B 的同行/从业者样本降为 D 的比例 ≥ 80%，10-18 批次真需求样本（skill 评分 A 且内容为求助/问价）误杀率 ≤ 10%；
- AC-4 断开 LLM（余额不足/错误 key）跑增量，新候选无 A/B 级、任务详情出现告警条（本地演练）。

## 11. 风险与说明

- personaTag 由 LLM 判定存在误判可能，硬规则只压分不删数据，人工可在列表按画像筛选复核；
- DeepSeek 余额不足属环境问题，需用户在「集成配置 → LLM」充值或更换供应商，代码不做自动切换；
- 历史候选（含 11-02 误判批次）不回填、不删除，通过画像筛选隔离。
