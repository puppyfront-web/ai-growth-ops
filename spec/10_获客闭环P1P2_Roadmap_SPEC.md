# 10. 获客闭环专业化 P1/P2 Roadmap SPEC

> 状态：规划冻结，未实施
> 前置：`spec/08_获客闭环专业化_SPEC.md`（P0 已实施）
> 说明：本文只定义优先级、边界和验收口径；不承诺当前版本交付。

## 1. 为什么需要 P1/P2

P0 解决了“线索→客户→商机→成交→漏斗”的一致性和可见性，但标准获客流程仍缺三块：

1. **触达**：找到潜客后，系统仍不能执行多触点跟进。
2. **规模**：主动获客只开放抖音，线索补全/合并和团队协作不足。
3. **经营**：没有成本、多触归因、外部 CRM 双向同步和预测。

## 2. 优先级与依赖

| 优先级 | 能力 | 解决的客户问题 | 依赖 |
| --- | --- | --- | --- |
| P1-1 | 触达序列 | “找到人之后怎么联系、什么时候联系、谁来联系” | P0 商机/SLA、P1-5 负责人 |
| P1-2 | 多平台主动获客 | “不能只靠抖音” | 能力矩阵、平台适配器 |
| P1-3 | 线索补全与合并 | “同一个人多渠道重复、信息不全” | P0 去重、身份模型 |
| P1-4 | 培育与表单 | “低意向线索没有长期培育” | P1-1、内容系统 |
| P1-5 | 团队协作与 SLA 报表 | “谁该跟、超时怎么办、管理者看不到负载” | P0 逾期队列 |
| P2-1 | 成本与多触归因 | “花的钱和带来的收入对不上” | P0 漏斗、P1-1 触达记录 |
| P2-2 | 外部 CRM / 预测 / A/B | “和现有销售体系、实验体系打通” | P2-1 |

## 3. P1-1 触达序列

### 3.1 目标

把“建议动作”升级为**可执行、可排期、可追踪、可合规**的多触点序列。

### 3.2 非目标

- 不做群发轰炸、不做绕过平台风控的发送。
- 不在未验收渠道上自动发送；默认人工确认。
- 不替代销售的个人微信；只记录触达结果。

### 3.3 数据模型（草案）

```prisma
enum OutreachChannel {
  official_dm
  wecom
  email
  phone_task
  manual
}

enum OutreachTouchStatus {
  planned
  due
  sending
  sent
  failed
  skipped
  replied
}

model OutreachSequence {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  description    String?
  channel        OutreachChannel
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?
  steps          OutreachStep[]
}

model OutreachStep {
  id           String   @id @default(uuid())
  sequenceId   String
  order        Int
  delayHours   Int
  template     String
  requireReview Boolean @default(true)
  sequence     OutreachSequence @relation(...)
}

model OutreachEnrollment {
  id             String   @id @default(uuid())
  organizationId String
  sequenceId     String
  customerId     String
  ownerId        String?
  status         String   @default("active") // active/paused/completed/cancelled
  startedAt      DateTime @default(now())
  stoppedAt      DateTime?
  stopReason     String?
  touches        OutreachTouch[]
}

model OutreachTouch {
  id            String   @id @default(uuid())
  enrollmentId  String
  stepId        String?
  channel       OutreachChannel
  scheduledAt   DateTime
  status        OutreachTouchStatus @default(planned)
  content       String?
  sentAt        DateTime?
  externalId    String?
  error         String?
  repliedAt     DateTime?
}
```

### 3.4 规则

- 每个序列必须有停止条件：回复、成交、退订、拉黑、人工暂停。
- 频控：同一客户每天最多 1 次自动触达；每周最多 3 次；跨序列共享额度。
- 静默期：默认 22:00–08:00 不发送。
- 高风险/价格/投诉内容必须人工确认。
- 所有发送走 Provider 接口，渠道未 `verified` 时只能生成任务，不能自动发送。
- 退订/黑名单是组织级事实来源，任何序列发送前必须检查。

### 3.5 API（草案）

- `GET/POST /api/outreach/sequences`
- `GET/PUT/DELETE /api/outreach/sequences/:id`
- `POST /api/outreach/enrollments`（customerId/sequenceId/ownerId）
- `POST /api/outreach/enrollments/:id/pause|resume|cancel`
- `GET /api/outreach/touches?status=due&ownerId=`
- `POST /api/outreach/touches/:id/send`
- `POST /api/outreach/touches/:id/skip`
- `POST /api/outreach/touches/:id/replied`

### 3.6 UI

- 客户详情增加“触达序列”卡片：当前序列、下一步、暂停/继续。
- `/outreach` 页面：序列模板、待发送队列、失败重试。
- 销售工作台：今日待触达、已回复、已停止。

### 3.7 验收

- Given 一个客户加入 3 步序列，When 第 1 步发送成功，Then 第 2 步按 delay 排期，客户回复后序列自动停止。
- Given 客户在退订名单，When 序列到期，Then 不生成发送任务并记录跳过原因。
- Given 渠道未 verified，When 自动发送，Then 只生成人工任务，不调用外部接口。
- Given 同一客户同一天已触达，When 第二个序列到期，Then 被频控拦截。

## 4. P1-2 多平台主动获客

### 4.1 目标

以能力矩阵为闸门，逐平台开放主动获客；先小红书，再视频号/知乎。

### 4.2 规则

- 只有 `prospecting === 'verified'` 的平台出现在默认平台列表。
- `beta` 平台需要显式开启并显示风险提示。
- 每个平台必须有：关键词搜索、候选聚合、证据归因、频控、验证码/中断恢复。
- 新平台接入必须先通过 contract test（搜索、评论抓取、去重、限流）。
- 禁止用同一个浏览器账号跨平台复用 cookie。

### 4.3 数据与 API

复用 `ProspectingTask` / `ProspectCandidate`，新增：

- `platformAccountId` 必填策略按平台配置。
- `ProspectingTask.schedule`（cron/interval）与 `lastRunAt`。
- `GET /api/prospecting/platforms` 返回当前可用平台与状态。

### 4.4 验收

- Given 小红书标记为 verified，When 创建任务，Then 可执行并产出证据。
- Given 平台为 beta，When 创建任务，Then 需要显式确认风险。
- Given 定时任务，When 到达时间，Then 生成一次任务且不重复。
- Given 账号触发验证码，When 任务中断，Then 状态为可恢复并提示人工处理。

## 5. P1-3 线索补全与合并

### 5.1 目标

补齐手机号/微信/公司/职位，并提供可审计的跨渠道合并。

### 5.2 规则

- 补全来源必须记录：provider、请求时间、返回字段、置信度、成本。
- 合并必须人工确认；合并后保留所有来源、互动、线索、商机。
- 合并规则：手机号精确匹配优先；平台身份次之；同名同公司仅提示，不自动合并。
- 合并写 `CustomerMergeLog`，支持追溯。

### 5.3 API（草案）

- `POST /api/customers/:id/enrich`
- `GET /api/customers/duplicates`
- `POST /api/customers/:id/merge`（sourceCustomerId/targetCustomerId/confirm）
- `GET /api/customers/:id/merge-history`

### 5.4 验收

- Given 两个客户手机号相同，When 执行合并，Then 只保留一个主客户，来源和商机全部迁移。
- Given 合并后，When 查看任一来源线索，Then 仍能打开主客户。
- Given 补全失败，When 重试，Then 不产生重复客户、不吞错。

## 6. P1-4 培育与表单

### 6.1 目标

让低意向线索进入内容培育，而不是被丢弃。

### 6.2 能力

- Lead magnet（资料包/课程/工具）与落地页。
- 表单提交进入 `Interaction(type=form_submission)`，走统一评分/去重/客户创建。
- 培育序列：按标签/等级/行为触发内容发送。
- 回复/点击/下载事件进入漏斗。

### 6.3 验收

- Given 访客提交表单，When 手机号已存在，Then 关联现有客户并记录来源。
- Given 客户处于培育序列，When 打开资料，Then 记录事件并更新意向分。
- Given 客户成交，When 仍在培育序列，Then 自动停止并记录原因。

## 7. P1-5 团队协作与 SLA 报表

### 7.1 能力

- 自动分配规则：按渠道/行业/地区/负载轮询。
- 分配通知、转交、接手、@提醒。
- SLA：A 级 4h、B 级 24h、C 级 72h；超时升级到负责人/管理员。
- 管理者视图：成员负载、逾期分布、响应时长、成交贡献。

### 7.2 验收

- Given 新 A 级线索，When 自动分配，Then 负责人收到通知且 nextActionAt=+4h。
- Given 负责人 4h 未动作，When 定时任务运行，Then 升级通知发送给管理员。
- Given 成员离职，When 转交，Then 未关闭线索/商机全部转移并写审计。

## 8. P2-1 成本与多触归因

- 成本录入：渠道预算、单条内容成本、人工成本。
- 归因：首触、末触、线性多触；默认末触，可切换。
- 指标：CPL、CAC、ROI、回收周期、渠道质量。
- 验收：给定两笔花费和三条触达，系统能给出可解释的归因结果和口径说明。

## 9. P2-2 外部 CRM / 预测 / A/B

- 外部 CRM 双向同步（HubSpot/纷享销客/自建）。
- 销售预测：按阶段概率和预计成交日。
- 内容/触达 A/B 测试：分流、样本量、显著性提示。
- 数据仓库导出：内容、互动、线索、商机、触达事件。

## 10. 通用验收门槛

每个 P1/P2 能力上线前必须满足：

1. 有独立 SPEC 和更新后的 Plan；
2. 数据模型迁移可空库重放；
3. 纯函数/状态机有单元测试；
4. 领域服务有幂等/组织隔离/权限测试；
5. UI 有空态、错误态、pending 态；
6. 涉及外部平台时，能力矩阵状态与真实证据一致；
7. 不新增未说明的 `any`、吞错、默认密码；
8. 交付记录写明未完成项和风险。

## 11. 建议节奏

| 阶段 | 内容 | 预计 |
| --- | --- | --- |
| P1-A | 触达序列 + 团队 SLA | 3–4 周 |
| P1-B | 小红书获客 + 线索合并 | 3–4 周 |
| P1-C | 培育/表单 + 自动分配 | 3 周 |
| P2-A | 成本/归因/预测 | 4 周 |
| P2-B | 外部 CRM / A/B / 数仓 | 4–6 周 |

具体任务拆分见 `spec/11_获客闭环P1P2_Plan.md`。
