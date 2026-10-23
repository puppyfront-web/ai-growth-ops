# 2026-10-23 询盘多渠道接入交付记录

## 背景

业务询盘来自各种国内外 IM（WhatsApp、Telegram、个人微信、Messenger、Instagram、Line、邮件等）。本次交付把询盘作为「数据录入渠道」接入客户体系，不涉及任何 IM 平台自动化（不收发消息、不接平台 API）。

对应规格：`spec/25_询盘多渠道接入_SPEC.md`、`spec/26_询盘多渠道接入_Plan.md`。

## 交付内容

1. **渠道枚举**：`AcquisitionChannel` 新增 `whatsapp / telegram / wechat_personal / email / messenger / instagram / line` 7 个值（迁移 `20261023110000_inquiry_channels`）；罕见 IM 继续用 `other` + 来源说明。
2. **联系方式**：`Customer` 新增可空 `email`、`imAccount` 字段与组织级索引；去重键扩展为 手机号 → 邮箱 → IM 账号 三级。
3. **询盘 Webhook**：`POST /api/inquiries/webhook`（`X-Webhook-Token` 复用线索来源 `LeadSourceConfig`），实时写入客户：渠道归一化、按渠道路由分配、通知负责人（联系方式脱敏）、记录 `inquiry_received` 动态；重复推送幂等。
4. **CSV 导入升级**：客户导入支持 邮箱 / IM 账号 列（含中英文表头别名与模板更新），渠道列接受别名归一化（`WhatsApp`/`微信`/`TG` → 标准值），预览重复检测扩展到邮箱。
5. **Web UI**：客户创建/编辑表单新增邮箱、IM 账号输入与 7 个新渠道选项（可清空保存）；客户详情展示邮箱/IM 账号；列表渠道筛选自动包含新渠道；导入面板映射自动出现新列。
6. **共享层**：`packages/shared` 新增 `ACQUISITION_CHANNELS` 单一事实源与 `normalizeInquiryChannel` 纯函数（别名表），客户导入与 API schema 均改为引用同一常量，消除三份枚举漂移。

## 测试证据

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 共享单测 | PASS | `tests/unit/shared/inquiry-channel.test.ts` 7 项；单测全量 602 项通过 |
| Webhook 集成 | PASS | `tests/integration/api/inquiry-webhook.test.ts` 5 项（401/403/400、创建+分配+通知、邮箱幂等、手机号合并、IM 账号补齐） |
| 导入集成 | PASS | `tests/integration/api/customer-import.test.ts` 2 项（映射建议+归一化+邮箱重复；落库+跳过重复） |
| Web 单测 | PASS | `tests/web/unit/customer-editor.test.tsx` 3 项；Web 全量 151 项通过 |
| 集成回归 | PASS（既有失败除外） | 44 个文件中 42 通过；3 个失败为既有问题（见下） |
| 类型与 Lint | PASS | `pnpm typecheck`、`pnpm lint` 通过 |
| 空库迁移重放 | PASS | `ai_growth_ops_migrate_check` 从零重放 28 个迁移成功，`prisma migrate diff` 无漂移 |
| 应用库 | PASS | `pnpm db:deploy` 后枚举 21 值、`customers.email/imAccount` 就位 |

### 既有失败（与本次无关）

- `tests/integration/api/platform-account-security.test.ts`：2 项，测试自身调用了不存在的 `api.delete`（辅助函数实为 `api.del`），来自提交 `0fe8fcb`。
- `tests/integration/api/account-auth-expired.test.ts`：1 项浏览器 Bridge 重新授权返回 401，属浏览器授权域既有问题。

## 应用库迁移状态修复（本次附带）

应用库 `_prisma_migrations` 存在历史遗留：`20261021090000_local_browser_bridge_auth` 记录为失败，但其效果已由 `db:push` 生效（列与索引已核对齐全），导致后续 `migrate deploy` 重放报错。已按 Prisma 标准流程 `migrate resolve --applied` 补记，随后 `db:deploy` 依次应用了 `20261023010000_platform_account_org_unique`（既有待应用迁移）与 `20261023110000_inquiry_channels`。

## 使用方式

- **存量批量**：客户管理 → 导入客户 → 下载最新模板（含 `email`、`im_account` 列）。
- **实时接入**：线索管理 → 来源页创建 token，外部系统 `POST /api/inquiries/webhook`，Header `X-Webhook-Token: <token>`，Body 至少含 `name` + (`phone`/`email`/`imAccount` 之一)，可选 `channel`（支持别名）、`company`、`message`、`country`。

## 风险与边界

- IM 渠道仅为**数据来源标识**：系统不具备在这些平台收发消息的能力，UI 与对外表述不得写成「支持 WhatsApp 自动回复」等。
- 手动创建客户仍要求中国手机号校验（既有行为）；海外联系方式走导入或 Webhook（海外号码按数字串原样保存）。
- 客户合并面板不处理 email/imAccount 冲突（保持现状）。
- 罕见 IM 渠道归一化为 `other`，需在来源说明里写明具体渠道。
