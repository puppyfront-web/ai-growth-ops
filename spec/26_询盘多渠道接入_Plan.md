# 询盘多渠道接入 Plan

对应 SPEC：`spec/25_询盘多渠道接入_SPEC.md`。按先测试、后实现拆分。

## 任务 0：前置阅读（已完成）

已核对：`AcquisitionChannel` 枚举（schema.prisma）、`Customer` 模型、`packages/shared/src/csv.ts` / `customer-import.ts` / `phone.ts`、`apps/api/src/schemas/customers.ts`、`apps/api/src/services/customer-import.ts`、`packages/database/src/lead-capture.ts`（复用模板）、`packages/database/src/assignment.ts`、`CustomerEditor.tsx` / `CustomerImportPanel.tsx`、`routes-customers.ts`。

## 任务 1：Red — shared 单测

文件：`tests/unit/shared/inquiry-channel.test.ts`

- `normalizeInquiryChannel`：21 个合法值直通；别名（wa/TG/微信/ig/邮件/e-mail…）；大小写与首尾空白；空串与未知值 → `other`。
- `ACQUISITION_CHANNELS` 常量包含 21 值且与类型一致。

验收：`pnpm vitest run tests/unit/shared/inquiry-channel.test.ts`（红）。

## 任务 2：Green — shared 实现

- 新建 `packages/shared/src/inquiry-channel.ts`：`ACQUISITION_CHANNELS`、`normalizeInquiryChannel`、别名表；`index.ts` 导出。
- `customer-import.ts` 的 `VALID_CHANNELS` 改为引用 `ACQUISITION_CHANNELS`（`Set` 构造）；`extractCustomerRow` 渠道列改走 `normalizeInquiryChannel`。

验收：任务 1 测试转绿；`packages/shared` 既有测试不回退。

## 任务 3：Red — Webhook 集成测试

文件：`tests/integration/api/inquiry-webhook.test.ts`（参照 `interaction-lead.test.ts` 的 server 启动模式 + 自建 `LeadSourceConfig` token）

用例：

1. 无 token → 401；错 token → 403。
2. 缺 `name` → 400；`phone/email/imAccount` 全缺 → 400。
3. 首次推送（channel=`WhatsApp`，email、message、company）→ 201：客户 `channel=whatsapp`、`email` 小写落库、`intent=message`、`assignedTo` 非空（建分配规则或组织内成员兜底）、负责人收到通知、`CustomerActivity(inquiry_received)` 存在。
4. 同 email 重复推送 → 201 `created:false`，客户总数不变，动态 +1。
5. 同客户补推 `imAccount` → 客户 `imAccount` 被补齐。

验收：`pnpm test:integration -- tests/integration/api/inquiry-webhook.test.ts`（红）。

## 任务 4：Green — 迁移 + 领域服务 + 路由

1. Prisma：`AcquisitionChannel` +7 值；`Customer` + `email`/`imAccount` + 2 索引 → 新迁移 `20xxxxxx_inquiry_channels`；`pnpm db:generate`。
2. `packages/database/src/inquiry-ingest.ts`：`ingestInquiry(db, source, payload)` —— 三级去重、创建/更新、分配、通知、动态（复用 `lead-capture.ts` 的 `defaultNextActionAt` 逻辑与 `applyAssignmentRules`）。
3. `apps/api/src/schemas/customers.ts`：`acquisitionChannelSchema` 扩 21 值；`inquiryWebhookSchema`；create/update 增加可选 `email`/`imAccount`。
4. `routes-customers.ts`：新增 `POST /api/inquiries/webhook`（token → `LeadSourceConfig`，调 `ingestInquiry`）。`deals.ts` 的渠道枚举副本同步。
5. 同步 TS 类型：`apps/web/src/types/customer.ts` 的 `AcquisitionChannel`。

验收：任务 3 测试转绿；`prisma migrate diff` 无漂移。

## 任务 5：Red — 客户导入集成测试

文件：`tests/integration/api/customer-import.test.ts`

1. 含 `邮箱/IM账号/渠道` 表头的 CSV preview：映射建议命中新列；`WhatsApp` 归一化为 `whatsapp`。
2. 库内已有同邮箱客户 → preview 标 `duplicate_in_db`。
3. confirm 落库：`email`/`imAccount`/新渠道写入客户。

验收：红。

## 任务 6：Green — 导入链路扩展

- `csv.ts`：`CustomerImportField` + `email`/`imAccount`、`FIELD_ALIASES`、`CUSTOMER_FIELD_LABELS`。
- `customer-import.ts`：`ParsedCustomerRow` + 两字段；preview 邮箱重复检测（`loadExistingEmails`）。
- `services/customer-import.ts`：execute 写入两字段；重复跳过逻辑含邮箱键。
- UI `CustomerImportPanel.tsx`：新列自动出现（字段列表来自 shared 常量）。

验收：任务 5 转绿。

## 任务 7：Web UI + 单测

1. `CustomerEditor.tsx`：渠道下拉 +7 项、邮箱/IM 账号输入；`CHANNEL_LABELS` 补全。
2. 客户详情页联系方式展示（邮箱脱敏、IM 账号脱敏）；列表渠道标签。
3. Red→Green：`tests/web/unit/customer-editor.test.tsx`（渲染选项、必填校验不回退、提交携带新字段）。

验收：`pnpm test:web -- tests/web/unit/customer-editor.test.tsx`。

## 任务 8：Verify + Report

- `pnpm typecheck`、`pnpm lint`。
- 受影响测试：shared 单测、两条集成测试、web 单测、既有 customers/leads 回归。
- 迁移链：空库重放检查（`prisma migrate diff --from-empty --to-migrations`）。
- 交付报告：改动清单、测试证据、风险（IM 渠道仅为数据录入、不宣称自动化；海外手机号校验放宽说明）。

## 依赖与顺序

任务 1→2（shared 先行）→ 3→4（迁移必须在集成测试前生成）→ 5→6 → 7 → 8。任务 5/6 依赖任务 4 的枚举扩展。
