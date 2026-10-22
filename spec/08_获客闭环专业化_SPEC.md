# 08. 获客闭环专业化 SPEC（P0）

> 状态：已冻结，进入 TDD 实施
> 关联：`AGENTS.md`、`docs/delivery/crm-release-spec.md`、`docs/delivery/crm-release-status.md`
> 目标读者：产品、后端、前端、测试、交付

## 1. 背景

当前系统已经能完成“关键词/评论区获客 → 评分 → 客户入库 → 评论私信承接”，但以标准获客流程验收，闭环在以下位置断开：

1. 找到潜客后没有触达动作和跟进节奏，系统只解决“找人”，没有解决“接触人”。
2. Lead 与 Customer 各自维护状态，成交看板与获客漏斗可能给出矛盾结果。
3. 没有商机（Deal）对象、金额、阶段和预计成交日，无法计算 pipeline、客单价、销售预测。
4. 内容分析只展示发布数，不能回答“哪条内容带来线索和成交”。
5. 首页是待办列表，不是经营漏斗；没有 CPL/CAC/ROI 的数据基础。
6. 对外宣称 6 平台，真实可验收能力主要是抖音，能力承诺与交付证据不一致。
7. 线索分配不通知被分配人，AI 生成的 `nextAction` 没有进入 UI，也没有逾期升级。

本 SPEC 只解决 **P0：让系统具备可解释的获客—跟进—成交闭环**。触达序列、多平台扩展、线索补全/合并、培育序列列为 P1/P2，不在本 SPEC 实施。

## 2. 目标与非目标

### 2.1 目标

- G1：Lead、Customer、Deal 三者的结局状态一致，任一入口标记成交/流失后，漏斗与客户档案同步。
- G2：每条在跟进的 Lead/Customer/Deal 都有明确的下一次动作和时间，超过时间进入逾期队列。
- G3：新增商机对象，支持金额、阶段、预计成交日、负责人、来源归因和阶段流转。
- G4：新增统一经营漏斗，覆盖内容→互动→线索→客户→商机→成交→收入。
- G5：内容分析展示每条内容的互动、线索、成交，而不是只展示发布数。
- G6：平台能力矩阵在产品内可见，状态与真实验收证据一致。
- G7：线索分配给具体成员时，被分配人收到站内通知。

### 2.2 非目标

- 不实现主动私信/邮件/企微的自动发送序列（P1）。
- 不扩大主动获客平台范围（P1）。
- 不实现客户合并 UI（P1）。
- 不实现多触归因、广告成本接入、外部 CRM 双向同步（P2）。
- 不修改自动回复的既有风控策略。
- 不重写历史 Lead/Customer 数据；通过增量迁移和回填脚本兼容。

### 2.3 成功标准

| 指标 | 目标 |
| --- | --- |
| 状态一致性 | Lead/Customer/Deal 任一结局更新后，另外两方与漏斗在同一事务内一致 |
| 逾期可见性 | 所有未关闭且有 `nextActionAt` 的记录可在统一逾期队列看到 |
| 成交可算 | 任意一条赢单商机可回答：客户、金额、负责人、成交时间、来源 |
| 内容归因 | 每条内容可回答：发布数、互动数、线索数、成交数、成交金额 |
| 能力诚实 | 未验收平台/能力在 UI 与文档中标记为 `Beta/未验收`，不出现在默认可用列表 |
| 交付证据 | 新增行为有单元/集成测试；类型、lint、受影响测试通过 |

## 3. 角色与核心旅程

### 3.1 角色

- 运营：创建获客任务，筛选潜客，转入客户，安排跟进。
- 销售：接收分配线索，记录跟进，推进商机阶段，登记金额和成交。
- 负责人：看统一漏斗、逾期队列、渠道/内容 ROI。
- 管理员：配置平台账号、能力矩阵、团队权限。

### 3.2 核心旅程 A：主动获客到成交

```text
创建获客任务
→ 潜客进入候选列表（A/B/C/D）
→ 转入客户（去重、保留证据）
→ 自动生成下一步动作（A 4h / B 24h / C 72h）
→ 销售记录跟进
→ 创建商机（金额、阶段、预计成交日）
→ 推进到赢单
→ 客户状态=won，商机 stage=won，漏斗/收入更新
```

### 3.3 核心旅程 B：内容互动到成交

```text
内容发布
→ 评论/私信同步
→ AI 分级，A/B 自动转 Lead 和 Customer
→ 销售跟进
→ 创建商机并成交
→ 内容分析显示该内容带来的线索、客户、成交
```

### 3.4 核心旅程 C：负责人复盘

```text
打开经营漏斗
→ 看各阶段数量与转化率
→ 看逾期队列和负责人负载
→ 按渠道/内容下钻
→ 调整关键词、内容和人员分配
```

## 4. 生命周期与状态机

### 4.1 对象职责

| 对象 | 职责 | 不承担 |
| --- | --- | --- |
| Lead | 平台来源、资格证据、首次接触状态 | 金额、报价、合同 |
| Customer | 运营主入口、联系方式、跟进记录 | 单一商机金额 |
| Deal | 销售阶段、金额、预计成交、赢单/输单 | 平台互动原始证据 |

### 4.2 LeadStatus（保留）

`NEW → QUALIFIED → SYNCING → SYNCED → ASSIGNED → CONTACTED → ADDED_WECOM → WON / LOST / INVALID`

### 4.3 CustomerStatus（保留）

`active / inactive / won / lost`

### 4.4 DealStage（新增）

```text
new → contacted → qualified → proposal → negotiation → won
                                              ↘ lost
won → negotiation（重开，需记录原因）
lost → negotiation（重开，需记录原因）
任意未关闭阶段 → lost
```

允许的流转（唯一事实来源：`packages/shared/src/deal-stage.ts`）：

| From | To |
| --- | --- |
| new | contacted, qualified, lost |
| contacted | qualified, proposal, negotiation, lost |
| qualified | proposal, negotiation, won, lost |
| proposal | negotiation, won, lost |
| negotiation | won, lost |
| won | negotiation |
| lost | negotiation |

不允许同阶段重复流转产生副作用；同阶段更新只更新字段。

### 4.5 结局同步规则

唯一事实来源：`packages/database/src/lifecycle.ts` 的 `syncLeadOutcome`、`syncCustomerOutcome`、`syncDealOutcome`。

- Lead → `WON`：
  - 关联 Customer.status = `won`（若存在）。
  - 关联未关闭 Deal → `won`，写 `wonAt/closedAt`。
  - 若无 Deal，创建一条 `stage=won`、金额为空的 Deal，标题使用客户名或线索名，保留来源。
- Lead → `LOST`：
  - 关联 Customer.status = `lost`（若存在）。
  - 关联未关闭 Deal → `lost`，写 `closedAt`，`lostReason` 取 lead 活动备注（若有）。
- Customer → `won/lost`：
  - 所有未关闭关联 Lead → `WON/LOST`。
  - 所有未关闭 Deal → `won/lost`。
- Deal → `won`：
  - Customer.status = `won`；关联 Lead.status = `WON`。
- Deal → `lost`：
  - Customer.status = `lost`；关联 Lead.status = `LOST`。
- Deal 从 `won/lost` 重开为未关闭阶段：
  - Customer.status = `active`；关联 Lead.status = `QUALIFIED`（若原为 WON/LOST）。
- 同步必须幂等；重复调用不重复创建 Deal、不重复写活动。

### 4.6 状态映射（纯函数）

`packages/shared/src/lifecycle.ts`：

```ts
export function isLeadClosed(status: LeadStatusLike): boolean;
export function isCustomerClosed(status: CustomerStatusLike): boolean;
export function isDealClosed(stage: DealStage): boolean;
export function isDealWon(stage: DealStage): boolean;
export function leadStatusToOutcome(status): 'won' | 'lost' | null;
export function customerStatusToOutcome(status): 'won' | 'lost' | null;
export function dealStageToOutcome(stage): 'won' | 'lost' | null;
export function defaultNextActionAt(level: 'A'|'B'|'C'|'D', now?: Date): Date | null;
```

默认 SLA：

| 等级 | 首次下一步动作 |
| --- | --- |
| A | 4 小时 |
| B | 24 小时 |
| C | 72 小时 |
| D | 不设置 |

## 5. 数据模型

### 5.1 新增枚举

```prisma
enum DealStage {
  new
  contacted
  qualified
  proposal
  negotiation
  won
  lost
}
```

### 5.2 新增 Deal / DealActivity

```prisma
model Deal {
  id                  String        @id @default(uuid())
  organizationId      String
  userId              String
  customerId          String
  leadId              String?
  title               String
  stage               DealStage     @default(new)
  amount              Decimal?      @db.Decimal(14, 2)
  currency            String        @default("CNY")
  expectedCloseDate   DateTime?
  ownerId             String?
  nextAction          String?
  nextActionAt        DateTime?
  lastContactedAt     DateTime?
  sourceChannel       AcquisitionChannel?
  sourceContentItemId String?
  sourcePublishJobId  String?
  lostReason          String?
  wonAt               DateTime?
  closedAt            DateTime?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  deletedAt           DateTime?
  metadata            Json?

  organization Organization    @relation(fields: [organizationId], references: [id])
  user         User            @relation(fields: [userId], references: [id])
  customer     Customer        @relation(fields: [customerId], references: [id])
  lead         Lead?           @relation(fields: [leadId], references: [id])
  activities   DealActivity[]

  @@index([organizationId, stage])
  @@index([organizationId, nextActionAt])
  @@index([customerId])
  @@index([leadId])
  @@map("deals")
}

model DealActivity {
  id        String   @id @default(uuid())
  dealId    String
  action    String
  note      String?
  operator  String?
  createdAt DateTime @default(now())
  metadata  Json?

  deal Deal @relation(fields: [dealId], references: [id], onDelete: Cascade)

  @@index([dealId, createdAt])
  @@map("deal_activities")
}
```

### 5.3 既有模型增量

`Customer` 增加：

```prisma
nextAction      String?
nextActionAt    DateTime?
lastContactedAt DateTime?
deals           Deal[]
```

`Lead` 增加：

```prisma
nextActionAt    DateTime?
lastContactedAt DateTime?
deals           Deal[]
```

`Organization` 增加 `deals Deal[]`；`User` 增加 `deals Deal[]`。

索引：

- `customers(organizationId, nextActionAt)`
- `leads(organizationId, nextActionAt)`

### 5.4 迁移与回填

- 新迁移只做增量：枚举、表、索引、可空字段。
- 回填脚本（幂等，可重复执行）：
  - 对 `status=won/lost` 的 Customer：若无 Deal，创建一条对应结局的 Deal，`amount=NULL`，标题 `<客户名> · 成交/流失`。
  - 对 `status=WON/LOST` 的 Lead 且有关联 Customer 的：按 4.5 规则同步。
- 回填通过 `prisma/seed.ts` 或一次性脚本执行，禁止在迁移 SQL 中依赖应用代码。
- 回填不覆盖用户已有 Deal。

## 6. API 契约

所有接口要求登录 + 组织上下文；写操作要求 `lead:edit` 或 `settings:manage`。

### 6.1 商机

#### `GET /api/deals`

Query：`stage?`, `customerId?`, `ownerId?`, `q?`, `page?`, `pageSize?`。

Response：

```json
{
  "items": [{
    "id": "...",
    "title": "...",
    "stage": "qualified",
    "amount": "12000.00",
    "currency": "CNY",
    "expectedCloseDate": "2026-11-01T00:00:00.000Z",
    "ownerId": "...",
    "nextAction": "发送报价单",
    "nextActionAt": "2026-10-20T02:00:00.000Z",
    "customer": { "id": "...", "displayName": "..." },
    "leadId": null,
    "createdAt": "..."
  }],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

#### `POST /api/deals`

Body：

```ts
{
  customerId: string;
  leadId?: string;
  title: string;
  stage?: DealStage;          // 默认 new
  amount?: number | null;     // 元，最多两位小数
  currency?: string;          // 默认 CNY
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  sourceChannel?: AcquisitionChannel;
  sourceContentItemId?: string | null;
  sourcePublishJobId?: string | null;
}
```

校验：

- `customerId` 必须属于当前组织且未删除。
- `leadId` 若提供，必须属于同一客户/组织。
- `amount >= 0`，最多两位小数，上限 `999999999999.99`。
- `expectedCloseDate` 必须可解析。
- 创建 `stage=won` 时写 `wonAt/closedAt`，并触发 `syncDealOutcome`。

#### `GET /api/deals/:id`

返回 Deal + customer + lead 摘要 + activities。

#### `PUT /api/deals/:id`

Body：`updateDealSchema`（所有字段可选，含 `lostReason`、`reopenReason`）。

- 阶段变更必须通过 `assertDealStageTransition`。
- 阶段变更为 `won`：写 `wonAt/closedAt`，清空 `lostReason`。
- 阶段变更为 `lost`：写 `closedAt`，要求 `lostReason` 非空。
- 阶段从 `won/lost` 重开：要求 `reopenReason` 非空，写活动。
- 每次阶段变更写 `DealActivity`。
- 调用 `syncDealOutcome`。

#### `GET /api/deals/pipeline`

Response：

```json
{
  "stages": [
    { "stage": "new", "label": "新建", "count": 0, "amount": "0.00" },
    { "stage": "qualified", "label": "已确认需求", "count": 2, "amount": "24000.00" }
  ],
  "totals": { "openCount": 2, "openAmount": "24000.00", "wonCount": 1, "wonAmount": "12000.00" }
}
```

只统计未删除；`openAmount` 不含 won/lost；`wonAmount` 按 `wonAt` 在窗口内（可选 `days`，默认 30）。

#### `GET /api/deals/overdue`

返回 `nextActionAt < now` 且未关闭的 Deal。

#### `POST /api/deals/:id/activities`

Body：`{ action: string; note?: string; nextAction?: string; nextActionAt?: string }`。

- 写活动，更新 `lastContactedAt=now`。
- 若提供 `nextActionAt`，更新下次动作。

#### `DELETE /api/deals/:id`

软删除；写活动；不物理删除。

### 6.2 统一逾期队列

#### `GET /api/follow-ups/overdue`

Query：`page?`, `pageSize?`, `ownerId?`。

Response：

```json
{
  "items": [
    {
      "type": "lead",
      "id": "...",
      "name": "...",
      "ownerId": "...",
      "nextAction": "首次联系",
      "nextActionAt": "...",
      "overdueHours": 6,
      "href": "/leads/..."
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

排序：`nextActionAt` 升序（最久逾期在前）。

范围：

- Lead：未关闭、`nextActionAt < now`。
- Customer：未关闭、`nextActionAt < now`。
- Deal：未关闭、`nextActionAt < now`。

### 6.3 分配通知

`PATCH /api/leads/:id/assign` 在 `assignedTo` 变化且非空时：

- 写 `LeadActivity`。
- 写站内 `Notification` 给被分配人：type=`lead`，title=`线索分配`，`actionUrl=/leads/:id`。
- 若被分配人不存在或等于操作者，不通知。

### 6.4 统一经营漏斗

#### `GET /api/analytics/funnel?days=30`

> `channel` 过滤延后到 P1；当前版本返回全渠道口径，避免在内容/互动/商机三套来源尚未统一时给出误导性的渠道切片。渠道质量表已提供按渠道的线索/客户/成交/金额明细。

Response：

```json
{
  "range": { "from": "...", "to": "...", "days": 30 },
  "stages": [
    { "key": "published", "label": "发布内容", "count": 10, "rateFromPrev": 0, "rateFromStart": 100 },
    { "key": "interactions", "label": "互动", "count": 200, "rateFromPrev": 2000, "rateFromStart": 2000 },
    { "key": "leads", "label": "线索", "count": 40, "rateFromPrev": 20, "rateFromStart": 400 },
    { "key": "customers", "label": "客户", "count": 20, "rateFromPrev": 50, "rateFromStart": 200 },
    { "key": "deals", "label": "商机", "count": 12, "rateFromPrev": 60, "rateFromStart": 120 },
    { "key": "won", "label": "成交", "count": 3, "rateFromPrev": 25, "rateFromStart": 30 }
  ],
  "revenue": {
    "pipelineValue": "80000.00",
    "wonRevenue": "36000.00",
    "avgDealSize": "12000.00",
    "currency": "CNY"
  },
  "byChannel": [
    { "channel": "douyin", "leads": 30, "customers": 15, "won": 2, "revenue": "24000.00" }
  ],
  "byContent": [
    {
      "contentItemId": "...",
      "title": "...",
      "published": 2,
      "interactions": 80,
      "leads": 12,
      "customers": 6,
      "won": 1,
      "revenue": "12000.00"
    }
  ],
  "overdue": { "leads": 3, "customers": 2, "deals": 1 }
}
```

口径：

- 时间窗口内“发生量”，不做严格 cohort；同一实体在多个阶段各计一次。
- `published`：`PublishJob.status=PUBLISHED` 且 `finishedAt`（或 `createdAt`）在窗口内。
- `interactions`：`Interaction.receivedAt` 在窗口内。
- `leads`：`Lead.createdAt` 在窗口内。
- `customers`：`Customer.createdAt` 在窗口内。
- `deals`：`Deal.createdAt` 在窗口内。
- `won`：`Deal.stage=won` 且 `wonAt` 在窗口内。
- `pipelineValue`：未关闭 Deal 金额合计。
- `wonRevenue`：窗口内赢单金额合计。
- `byContent`：通过 `Lead.sourcePublishJobId` 关联；无来源的线索不计入内容下钻。
- 金额以字符串返回，避免浮点误差。

### 6.5 内容 ROI

`GET /api/analytics/content-roi` 扩展为：

```json
[{
  "id": "...",
  "title": "...",
  "type": "image_text",
  "publishCount": 2,
  "publishedCount": 2,
  "interactionCount": 80,
  "leadCount": 12,
  "customerCount": 6,
  "wonCount": 1,
  "wonRevenue": "12000.00",
  "engagementScore": 152
}]
```

排序：`leadCount desc` → `publishedCount desc` → `createdAt desc`；最多 20 条。

### 6.6 平台能力矩阵

#### `GET /api/platforms/capabilities`

返回共享常量 `PLATFORM_CAPABILITY_MATRIX`：

```ts
type CapabilityStatus = 'verified' | 'beta' | 'unverified' | 'unsupported';
type PlatformCapabilities = {
  label: string;
  publish: CapabilityStatus;
  prospecting: CapabilityStatus;
  interactionSync: CapabilityStatus;
  reply: CapabilityStatus;
  officialApi: CapabilityStatus;
  note?: string;
};
```

状态必须与 `docs/delivery/crm-release-status.md` 一致；更新能力状态时同时更新文档和测试。

UI：`/integrations` 页面展示矩阵，`beta/unverified/unsupported` 有明确标签和说明；平台账号页的“支持能力”不得超出矩阵。

## 7. UI 变更

### 7.1 销售管道 `/leads/pipeline`

- 保留 Lead 看板，但增加“商机管道”切换或新页面 `/deals/pipeline`。
- 商机卡片显示：客户名、标题、金额、阶段、负责人、下次动作（逾期红色）。
- 阶段列头显示数量 + 金额合计。
- 拖拽阶段变更调用 `PUT /api/deals/:id`；非法流转 toast 说明原因。
- 空态引导“从客户详情创建商机”。

### 7.2 客户详情 `/customers/:id`

- 增加“商机”区块：列表、阶段、金额、预计成交、负责人、下次动作；支持新建/编辑。
- 增加“下次动作”字段（文本 + 时间），保存调用 `PUT /api/customers/:id`。
- 活动记录后刷新 `lastContactedAt`。
- 顶部显示逾期提示（若 `nextActionAt < now`）。

### 7.3 线索详情 `/leads/:id`

- 展示 `nextAction` 与 `nextActionAt`，可编辑。
- 状态改为 WON/LOST 时提示会同步客户和商机。
- 分配后显示“已通知被分配人”。

### 7.4 经营漏斗 `/analytics/funnel`

- KPI：发布、互动、线索、客户、商机、成交、成交额、客单价。
- 漏斗图 + 各阶段转化率。
- 逾期卡片：Lead/Customer/Deal。
- 渠道表、内容表（可排序、可跳转）。
- 时间范围 7/30/90 天。

### 7.5 工作台 `/dashboard`

- 在“今日待办”上方增加 4 个经营指标：本周线索、待跟进、逾期、本月成交额。
- “待跟进”跳转统一逾期队列。

### 7.6 内容分析 `/analytics/content`

- 图表从“发布数”升级为：发布数、互动数、线索数、成交数。
- 表格列：内容、发布、互动、线索、客户、成交、成交额。
- 标题与副标题明确口径。

## 8. 验收标准（Given/When/Then）

### AC-1 状态同步

- Given 一个 Lead 关联 Customer 和未关闭 Deal
- When 将 Lead 状态改为 WON
- Then Customer.status=won，Deal.stage=won，Deal.wonAt 非空，漏斗 won=1，重复调用不重复创建 Deal。

- Given 一个 Customer 有两条未关闭 Lead
- When 将 Customer 状态改为 lost
- Then 两条 Lead 都变为 LOST，未关闭 Deal 变为 lost，已关闭 Deal 不变。

### AC-2 默认 SLA

- Given A 级线索自动转客户
- When 创建成功
- Then `nextActionAt` 约为当前时间 + 4 小时（允许测试时钟误差）。
- B 级 +24h，C 级 +72h，D 级为空。

### AC-3 逾期队列

- Given Lead/Customer/Deal 各一条 `nextActionAt` 已过期且未关闭
- When 请求 `/api/follow-ups/overdue`
- Then 三条都返回，按 `nextActionAt` 升序；已成交/流失的记录不返回。

### AC-4 线索分配通知

- Given 线索分配给成员 B
- When 调用分配接口
- Then B 收到一条 type=lead 的通知，actionUrl 指向该线索；操作者分配给自己不产生通知。

### AC-5 商机阶段流转

- Given 商机 stage=proposal
- When 更新为 negotiation
- Then 成功并写活动；更新为 new 返回 400 并提示非法流转。
- Given stage=lost 且 `lostReason` 为空
- When 更新为 lost
- Then 返回 400。

### AC-6 成交与收入

- Given 一个 stage=won、amount=12000 的商机，wonAt 在窗口内
- When 请求经营漏斗
- Then won=1，wonRevenue=12000.00，avgDealSize=12000.00。

### AC-7 内容归因

- Given 一条内容有 2 个发布任务、80 条互动、12 条线索、6 个客户、1 个赢单商机
- When 请求内容 ROI
- Then 返回对应计数和 `wonRevenue`；无来源线索不计入。

### AC-8 能力矩阵

- Given 打开 `/integrations`
- When 查看能力矩阵
- Then 抖音显示已验证能力，其余平台明确标注 Beta/未验收/不支持；文案与交付状态文档一致。

### AC-9 组织隔离

- Given 组织 A 的 Deal
- When 组织 B 用户请求详情、更新、删除
- Then 返回 404/403，不泄露数据。

## 9. 测试矩阵

| 层级 | 文件 | 覆盖 |
| --- | --- | --- |
| 单元 | `tests/unit/shared/lifecycle.test.ts` | 状态映射、SLA、合法/非法流转 |
| 单元 | `tests/unit/shared/funnel-analytics.test.ts` | 漏斗计数、转化率、金额聚合、空数据 |
| 单元 | `tests/unit/shared/content-roi.test.ts` | 内容归因、去重、排序 |
| 单元 | `tests/unit/shared/platform-capabilities.test.ts` | 能力矩阵状态合法、无“未验收”被标 verified |
| 集成 | `tests/integration/lifecycle-sync.integration.test.ts` | Lead/Customer/Deal 结局同步、幂等、事务 |
| 集成 | `tests/integration/api/deals.test.ts` | CRUD、校验、阶段流转、组织隔离、逾期、管道 |
| 集成 | `tests/integration/api/funnel.test.ts` | 漏斗、内容 ROI、逾期、权限 |
| 集成 | `tests/integration/api/lead-assign-notification.test.ts` | 分配通知、自己不通知 |
| Web | `tests/web/unit/deal-pipeline.test.tsx` | 管道渲染、空态、逾期标识 |
| Web | `tests/web/unit/customer-deals.test.tsx` | 客户详情商机区块、创建/更新 |
| Web | `tests/web/unit/funnel-analytics.test.tsx` | 漏斗 KPI、空态、错误态 |
| E2E | `tests/e2e/flow-deal-close-loop.test.ts` | 潜客→客户→商机→成交→漏斗→内容 ROI（Mock 平台，不触达真实平台） |

## 10. 兼容与迁移

- 旧数据：`Customer.status` 已有 won/lost；通过回填创建对应 Deal，金额为空。
- 旧 API：`GET /api/analytics/acquisition` 保持不变；新漏斗是增量接口。
- 旧 UI：`/leads/pipeline` 保留；新增商机管道不替换。
- 旧内容分析：字段只增不减，前端可逐步切换。
- 迁移顺序：schema → generate → migration → 回填 → 代码。生产部署前必须空库重放 + `prisma migrate diff` 检查。

## 11. 风险

| 风险 | 缓解 |
| --- | --- |
| 双状态同步引入循环更新 | 同步函数幂等；同事务内先读后写；禁止在触发器中递归 |
| 金额 Decimal 序列化不一致 | API 统一返回字符串；前端用字符串展示，不使用 `parseFloat` 做累加 |
| 旧数据无金额导致客单价为 0 | 客单价只统计有金额的赢单；分母为 0 时返回 0 |
| 内容归因缺失 sourcePublishJobId | 无来源不计入；UI 显示“来源未知” |
| 状态流转过严影响现有操作 | 只对 Deal 强制；Lead/Customer 保持现有可编辑，但结局同步 |
| 能力矩阵与真实证据漂移 | 矩阵常量 + 文档 + 测试三处同步；发布前人工核对 |

## 12. 交付定义

本 SPEC 完成需同时满足：

1. 本文件与 `spec/09_获客闭环专业化_Plan.md` 已更新；
2. 第 8 节验收标准全部有自动化测试或明确的人工验收记录；
3. `pnpm typecheck`、`pnpm lint`、受影响测试通过；
4. 迁移可在空库重放；
5. `AGENTS.md` 中的 Definition of Done 全部勾选；
6. 交付报告列明未完成项（P1/P2）与风险。
