# 04. 测试用例与 TDD 计划 v8

## 1. TDD 原则

1. 每个业务模块先写测试再写实现。
2. 外部平台全部使用 Mock Provider 做默认测试。
3. Real Provider 只做可选集成测试，不阻塞 CI。
4. AI 输出必须通过 Schema 校验。
5. 发布、同步、回复、采集必须覆盖失败路径。
6. E2E 测试必须覆盖主业务闭环。

---

## 2. 测试分层

| 层级             | 工具            | 目标                                 |
| ---------------- | --------------- | ------------------------------------ |
| Unit Test        | Vitest/Jest     | 函数、状态机、规则引擎               |
| Integration Test | Jest + Test DB  | API、Repository、队列、Provider Mock |
| E2E Test         | Playwright      | 前端到后端完整流程                   |
| Contract Test    | Zod / Pact-like | Provider 输入输出契约                |
| AI Output Test   | Zod + fixture   | AI 输出结构稳定                      |
| Regression Test  | Snapshot        | Prompt、报告、页面关键结构           |

---

## 3. 测试环境

### 3.1 默认测试环境

```text
PostgreSQL Test Container
Redis Test Container
MinIO Test Container
Mock Provider
Mock AI Provider
Mock Feishu Provider
Mock WeCom Provider
```

### 3.2 不进入 CI 的测试

- 真实抖音发布。
- 真实小红书发布。
- 真实视频号发布。
- 真实 MediaCrawler 采集。
- 真实飞书/企微写入。

这些放入 manual integration test。

---

## 4. 核心测试用例

## 4.1 账号管理测试

### TC-ACC-001 创建平台账号

前置：无。

步骤：

1. 调用 `POST /api/accounts`。
2. platform = douyin。
3. mode = mock。

预期：

- 返回账号 ID。
- 账号状态为 active。
- 能力矩阵包含 publishTextImage、publishVideo 等字段。

### TC-ACC-002 账号授权失效不影响系统

步骤：

1. 将某账号状态改为 expired。
2. 创建发布任务。

预期：

- 任务进入 NEED_MANUAL_REPAIR。
- 其他账号任务不受影响。

---

## 4.2 内容模块测试

### TC-CONTENT-001 创建内容项目

预期：

- 成功创建 ContentProject。
- 默认 ownerId 为当前 user_id。

### TC-CONTENT-002 生成 6 平台内容版本

输入：一个基础选题。

预期：

- 生成 6 个 ContentVariant。
- 每个 variant 的 platform 不同。
- 每个 variant 有 title、body、cta。

### TC-CONTENT-003 图文和视频素材关联

预期：

- 图文 variant 能关联图片素材。
- 视频 variant 能关联视频和封面。

---

## 4.3 发布模块测试

### TC-PUB-001 Mock 图文发布

步骤：

1. 创建小红书图文 ContentVariant。
2. 创建 PublishJob。
3. 执行 publish.execute。

预期：

- 状态从 READY → RUNNING → PUBLISHED。
- 生成 mock externalPostId。
- 写入 PublishAttempt。

### TC-PUB-002 Mock 视频发布

同上，内容类型为 video。

预期：

- 视频素材存在时发布成功。
- 视频素材缺失时发布前校验失败。

### TC-PUB-003 6 平台 12 任务 E2E 发布

步骤：

1. 生成 6 平台图文版本。
2. 生成 6 平台视频版本。
3. 创建 12 个 PublishJob。
4. 执行队列。

预期：

- 12 个任务全部 PUBLISHED。
- 12 条 PublishAttempt 成功。
- Dashboard 显示发布数量为 12。

### TC-PUB-004 Provider 失败重试

步骤：

1. MockProvider 设置前两次失败，第三次成功。
2. 执行发布。

预期：

- PublishAttempt 有 3 条。
- 最终状态 PUBLISHED。
- 错误日志完整。

### TC-PUB-005 Browser Assist 等待人工确认

预期：

- 状态进入 WAITING_HUMAN_CONFIRM。
- 生成人工确认 URL。
- 确认后进入 PUBLISHED。

---

## 4.4 评论私信测试

### TC-INT-001 Mock 评论入库

输入：Mock 评论。

预期：

- 创建 Interaction。
- 归属平台、账号、内容。
- 状态为 NEW。

### TC-INT-002 评论去重

输入：相同 externalInteractionId。

预期：

- 不重复创建 Interaction。
- 更新 lastSeenAt。

### TC-INT-003 AI 回复建议

输入：评论“多少钱？”

预期：

- intent = price_inquiry。
- suggestedReply 不为空。
- riskLevel 不为空。

### TC-INT-004 高风险不自动回复

输入：投诉/负面内容。

预期：

- canAutoReply = false。
- requiredAction = human_review。

---

## 4.5 线索评分测试

### TC-LEAD-001 A 级线索识别

输入：用户问“价格多少，怎么预约？”

预期：

- leadLevel = A。
- confidence >= 0.8。
- nextAction 包含 notify_sales。

### TC-LEAD-002 B 级线索识别

输入：用户问“有没有案例？”

预期：

- leadLevel = B。
- tags 包含 案例咨询。

### TC-LEAD-003 D 级无效线索

输入：广告、辱骂或无意义文本。

预期：

- leadLevel = D。
- 不同步飞书和企微。

### TC-LEAD-004 线索去重

输入：同一平台同一用户连续咨询。

预期：

- 只创建一个 Lead。
- 新互动追加到 LeadActivity。

---

## 4.6 飞书/企微测试

### TC-SINK-001 A 级线索同步飞书多维表格

预期：

- 调用 Feishu Mock Provider。
- 创建 LeadExternalMapping。
- LeadSinkSyncLog status = success。

### TC-SINK-002 飞书同步失败重试

预期：

- 失败进入 retry。
- 达到最大重试后标记 failed。
- 不丢失本地 Lead。

### TC-SINK-003 企微负责人提醒

预期：

- A 级线索触发 WeCom Notify。
- 负责人字段不为空。

---

## 4.7 Research Ops 测试

### TC-RES-001 创建关键词调研任务

预期：

- ResearchTask 创建成功。
- 状态为 QUEUED。

### TC-RES-002 Mock MediaCrawler 返回公开内容

预期：

- 创建 CollectedPost。
- 创建 CollectedComment。
- 写入 CrawlerRunLog。

### TC-RES-003 评论痛点分析

输入：多条评论。

预期：

- ResearchInsight 包含 painPoints。
- ContentOpportunity 数量大于 0。

### TC-RES-004 采集限频

步骤：短时间内重复触发同一平台任务。

预期：

- 后续任务被 rate_limited。
- 不执行真实 Provider。

### TC-RES-005 采集失败熔断

步骤：连续失败 3 次。

预期：

- Provider 暂停。
- 状态 PAUSED。
- 系统生成告警。

---

## 4.8 AI Skill 测试

### TC-AI-001 Skill 输出 Schema 校验

每个 Skill 输出必须通过 Zod。

### TC-AI-002 AI 非 JSON 输出修复

输入：Mock AI 返回非 JSON。

预期：

- 系统尝试 repair。
- repair 失败则返回 AI_OUTPUT_INVALID。

### TC-AI-003 Prompt 快照测试

预期：

- Prompt 模板变更需要显式更新 snapshot。

---

## 4.9 数据复盘测试

### TC-ANA-001 内容线索归因

步骤：

1. 创建 PublishJob。
2. 创建 Interaction。
3. 转 Lead。

预期：

- Analytics 能显示该内容带来的线索数。

### TC-ANA-002 平台获客贡献

预期：

- 能按平台聚合 A/B/C/D 线索数量。

### TC-ANA-003 周报生成

预期：

- 生成本周发布数、线索数、最高转化内容、下周建议。

---

## 5. E2E 主验收测试

### E2E-001 完整 Mock 自动运营闭环

步骤：

1. 登录系统。
2. 创建 6 平台账号。
3. 创建内容项目。
4. 输入运营目标。
5. 生成选题。
6. 生成图文和视频内容。
7. 生成 6 平台版本。
8. 创建 12 个发布任务。
9. Mock 发布成功。
10. Mock 同步评论和私信。
11. AI 生成回复建议。
12. AI 识别 A/B/C/D 线索。
13. A/B 级线索同步飞书和企微。
14. 查看复盘看板。

预期：

- 全流程无报错。
- 数据完整入库。
- 页面状态正确。
- 日志完整。

---

## 6. 测试覆盖率目标

| 模块                |   覆盖率 |
| ------------------- | -------: |
| 状态机              |      90% |
| Provider Gateway    |      85% |
| Lead Scoring Rules  |      90% |
| Reply Policy Engine |      90% |
| Repository          |      80% |
| API Controller      |      75% |
| Worker Jobs         |      80% |
| E2E 主流程          | 必须覆盖 |

---

## 7. TDD 执行模板

每个功能按以下顺序执行：

```text
1. 写测试用例
2. 运行测试，确认失败
3. 写最小实现
4. 运行测试，确认通过
5. 重构
6. 再次运行测试
7. 更新文档
```

---

## 8. 测试命令

```bash
pnpm lint
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm db:test:reset
```

---

## 9. 发布前验收清单

- [ ] Docker Compose 可启动。
- [ ] 数据库 migration 成功。
- [ ] Seed 数据可用。
- [ ] Mock E2E 全链路通过。
- [ ] AI Mock 全部通过。
- [ ] 飞书/企微 Mock 同步通过。
- [ ] Provider 失败重试通过。
- [ ] Research 限频和熔断通过。
- [ ] 日志和审计可查看。
- [ ] 高风险回复不会自动发送。

## 10. 未来媒体生成预留测试

### TC-MGEN-001 Disabled Provider 不允许真实生成

步骤：

1. 系统未配置任何真实生图/生视频 Provider。
2. 调用 `POST /api/media-generation/image`。

预期：

- 返回 `provider_disabled`。
- 不产生任何真实外部 API 调用。
- 写入审计日志。

### TC-MGEN-002 Mock Provider 生成素材元数据

步骤：

1. 启用 `MockMediaGenerationProvider`。
2. 调用模拟生图接口。

预期：

- 返回 mock media asset。
- `MediaAsset.sourceType = mock_generated`。
- `MediaAsset.reviewStatus = pending_review`。
- 不能直接进入发布队列。

### TC-MGEN-003 未审核生成素材不能发布

步骤：

1. 创建 `pending_review` 素材。
2. 用该素材创建发布任务。

预期：

- 发布任务创建失败。
- 错误原因：`media_asset_not_approved`。

### TC-MGEN-004 审核通过后可关联发布

步骤：

1. 将 mock generated 素材审核为 `approved`。
2. 创建图文或视频发布任务。

预期：

- 发布任务创建成功。
- 发布流程仍走 Mock Platform Provider。
