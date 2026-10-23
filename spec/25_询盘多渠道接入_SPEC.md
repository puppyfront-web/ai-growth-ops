# 询盘多渠道接入 SPEC

## 1. 背景

业务方的询盘（主动来咨询的意向客户）来自各种国内外 IM：WhatsApp、Telegram、微信（个人号）、Messenger、Instagram、Line、邮件等，渠道不可穷举。当前系统的接入能力存在三处不匹配：

- 客户渠道枚举 `AcquisitionChannel`（14 个值）只覆盖内容平台与传统渠道（website/phone/exhibition 等），没有 IM 值；询盘只能标 `other`，渠道统计与筛选失效。
- `Customer` 联系方式只有 `phone`（必填、按中国手机号校验）；海外询盘的核心联系方式是**邮箱**与 **IM 账号**（微信号、Telegram handle 等），当前无处存放。
- 实时接入只有 `POST /api/leads/webhook/ingest`（建**线索**，无联系方式字段）；而询盘按现有业务语义（对照表单获客：真人主动联系、高意向）应直接进**客户**体系，才能进入分配、跟进、触达、商机闭环。

既有可复用能力：客户 CSV 导入（preview + confirm + 列映射建议，`packages/shared/src/csv.ts` + `customer-import.ts`）、`LeadSourceConfig` token 体系（线索来源页可创建/停用 token）、`applyAssignmentRules`（按渠道路由分配）、通知中心、`normalizePhone`。

## 2. 目标

1. 渠道枚举扩展：`AcquisitionChannel` 新增 7 个常用 IM 渠道 `whatsapp / telegram / wechat_personal / email / messenger / instagram / line`；罕见 IM 继续用 `other` + `sourceNote` 说明。
2. 客户联系方式补齐：`Customer` 新增可空字段 `email`、`imAccount`；去重键从「仅手机号」扩展为**手机号 → 邮箱 → IM 账号**三级（任一命中即视为同一客户）。
3. 新增询盘 Webhook：`POST /api/inquiries/webhook`，凭 `X-Webhook-Token`（复用 `LeadSourceConfig`）把任意 IM 渠道的询盘实时写入客户：自动按渠道路由分配、通知负责人、记录客户动态；重复推送幂等去重。
4. 存量批量导入升级：客户 CSV 导入支持 `email`、`imAccount` 列（含自动列映射建议），渠道列接受 IM 渠道别名（如 `WhatsApp`、`微信`、`TG` 自动归一化）。
5. Web UI 对齐：客户创建/编辑表单、导入面板、客户列表与详情展示新渠道与联系方式。

## 3. 非目标

- **不做 IM 平台自动化**：不收发消息、不接入任何 IM 官方 API。本功能只是「询盘数据录入通道」，UI 与文档不得表述为「支持 WhatsApp 自动回复」等能力（平台能力诚实原则，对照 `docs/delivery/crm-release-status.md` 能力矩阵）。
- 不改动 `Lead` 模型与既有线索 Webhook（平台互动采集链路保持原样）。
- 不做海外手机号格式深度校验（`normalizePhone` 现状保留；海外号码原样存储为 digits 串）。
- 不做多语言/时区、不新增角色与权限。
- 客户合并（CustomerMergePanel）不合并 email/imAccount 冲突策略（保持现状字段拼接）。

## 4. 数据模型

### 4.1 `AcquisitionChannel` 枚举（Prisma，增量迁移）

新增值：`whatsapp`、`telegram`、`wechat_personal`、`email`、`messenger`、`instagram`、`line`。

`ALTER TYPE ... ADD VALUE` 逐条追加，不重命名、不删除既有值（迁移可重放）。

### 4.2 `Customer` 新字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `email` | `String?` | 邮箱，存前 trim + 小写 |
| `imAccount` | `String?` | IM 账号（微信号 / Telegram handle / WhatsApp 号码等，原样保存） |

新增索引：`@@index([organizationId, email])`、`@@index([organizationId, imAccount])`（与既有 `phone` 索引对齐，支撑去重查询）。

### 4.3 去重键定义

同一组织内按优先级依次匹配（`deletedAt: null`）：

1. `phone = normalizePhone(input.phone)`（非空时）
2. `email = input.email.toLowerCase()`（非空时）
3. `imAccount = input.imAccount.trim()`（非空时）

`findFirst` 以 OR 组合查询；命中任一键即视为已存在客户。

## 5. 渠道归一化（`packages/shared` 新增纯函数）

新文件 `packages/shared/src/inquiry-channel.ts`：

```ts
normalizeInquiryChannel(raw: string): AcquisitionChannel
```

规则：trim → 小写 → 先匹配既有合法渠道值（14 + 7 = 21 个）→ 再匹配别名表 → 否则 `other`。

别名表（首版）：

| 归一化结果 | 别名 |
| --- | --- |
| `whatsapp` | `wa`、`whats app`、`whatsup` |
| `telegram` | `tg`、`电报` |
| `wechat_personal` | `微信`、`个人微信`、`wechat`、`wx`、`vx` |
| `email` | `e-mail`、`mail`、`邮件`、`邮箱`、`电子邮件` |
| `messenger` | `fb messenger`、`facebook messenger` |
| `instagram` | `ig`、`ins` |
| `line` | `赖`、`line聊天` |

合法渠道清单以 shared 导出的 `ACQUISITION_CHANNELS` 常量为单一事实源，`customer-import.ts` 的 `VALID_CHANNELS` 改为引用它（消除两份枚举漂移）。

## 6. API

### 6.1 新增 `POST /api/inquiries/webhook`（无需登录，token 鉴权）

鉴权：`X-Webhook-Token` → `LeadSourceConfig.token`，无效或停用返回 403；缺失 401。

请求体（Zod 校验，`apps/api/src/schemas/customers.ts`）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name`（或 `externalUserName`） | 是 | 客户称呼 |
| `channel` | 否 | 渠道原文，经 `normalizeInquiryChannel` 归一化，默认 `other` |
| `phone` / `email` / `imAccount` | 三选一 | 至少一个联系方式，否则 400 |
| `company` | 否 | 公司，默认 `待补充` |
| `message` | 否 | 询盘内容，写入 `intent` 与客户动态 |
| `country` | 否 | 国家/地区，写入 `metadata.country` |

行为（领域服务 `packages/database/src/inquiry-ingest.ts`，复用 lead-capture 模式）：

- 已存在客户：合并标签 `[询盘, 渠道名]`、追加 `sourceNote`、补齐缺失的 `email/imAccount/phone`、`assignedTo` 为空时按渠道路由分配；记录 `CustomerActivity(action: 'inquiry_received')`；返回 `{ ok: true, customerId, created: false }`。
- 新客户：创建 `channel`、`intent = message || '询盘接入'`、`company/role` 缺省 `待补充`、标签 `[询盘, 待跟进]`、`nextAction: '首次联系'`、`nextActionAt` 按来源 `defaultLevel`（缺省 B 级）SLA；`applyAssignmentRules(db, orgId, { channel }, 'customer')` 分配；通知负责人（`type: 'lead'`，`actionUrl: /customers/:id`，内容含脱敏联系方式）。
- 幂等：同联系方式重复推送不新建客户，`created: false`；去重与写入在 `pg_advisory_xact_lock`（组织 + 首个联系方式）事务内执行，并发推送串行化。

成功 `201 { ok, customerId, created }`；入参问题 400 `{ error }`；同一 IP 超过 30 次/分钟 429；其余服务端异常 500（不透出内部错误信息）。

### 6.2 客户 CSV 导入扩展

- `CustomerImportField` 增加 `email`、`imAccount`；`FIELD_ALIASES` 增加对应别名（`邮箱/e-mail/邮件`；`微信号/whatsapp/telegram/im` 等）。
- `extractCustomerRow` 解析并返回两字段；渠道列经 `normalizeInquiryChannel` 归一化（不再仅白名单直通，未知值落 `other` 而非强制 `import`）。
- preview 重复检测扩展：手机号之外，邮箱命中已有客户也标记 `duplicate_in_db`。
- execute 写入 `email`、`imAccount`。
- 现有必填列规则不变（displayName/phone/company/role/intent 必映射），新列均为可选。

### 6.3 既有客户创建/更新接口

`createCustomerSchema` / `updateCustomerSchema` 的 `acquisitionChannelSchema` 扩为新 21 值；`createCustomerSchema` 增加可选 `email`、`imAccount`（存前小写/trim）。`phone` 仍必填且按中国手机号校验（手动录入路径不变，海外联系方式走导入或 Webhook）。

## 7. UI

- `CustomerEditor`：渠道下拉增 7 项（`WhatsApp / Telegram / 微信(个人) / 邮件 / Messenger / Instagram / Line`）；新增「邮箱」「IM 账号」输入（可选）。
- `CustomerImportPanel`：映射字段列表出现新列（可选，不标星）。
- 客户列表：渠道筛选与标签展示新渠道中文文案。
- 客户详情：联系方式区展示邮箱与 IM 账号（脱敏规则：邮箱显示首字符 + 域名；IM 账号首 2 位 + `****`，仅详情页完整显示，列表不展示）。
- 渠道标签 UI 统一加「数据来源渠道」语义，不出现「自动回复/自动化」表述。

## 8. 验收标准

1. Webhook：无 token 401、错 token 403、缺名字或全部联系方式缺失 400；带 `channel: 'WhatsApp'`、`email` 的首次推送创建客户且 `channel=whatsapp`、分配与通知生效；同邮箱重复推送 `created: false` 且客户数不变、动态 +1。
2. 导入：含 `email/imAccount/channel` 列的 CSV，preview 正确建议映射并识别邮箱重复；confirm 后客户带新渠道与联系方式入库；渠道别名归一化生效。
3. 归一化纯函数：大小写、别名、空串、未知值边界全覆盖（单测）。
4. `pnpm typecheck`、`pnpm lint`、新增测试全部通过；迁移空库可重放、`prisma migrate diff` 无漂移。
5. 既有客户/线索/表单行为不回退（既有测试套通过）。

## 9. 测试矩阵

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| shared 单测 | `tests/unit/shared/inquiry-channel.test.ts` | 归一化：合法值直通、别名、大小写/空白、未知→other、空串 |
| 集成 | `tests/integration/api/inquiry-webhook.test.ts` | 401/403/400；创建成功（字段、分配、通知、动态）；三级去重幂等；补齐缺失联系方式 |
| 集成 | `tests/integration/api/customer-import.test.ts` | 新列映射建议；渠道归一化；邮箱重复标记；execute 落库 email/imAccount |
| Web 单测 | `tests/web/unit/customer-editor.test.tsx` | 编辑器渲染新渠道选项与联系方式字段；提交携带新字段 |
| Web 单测 | 既有客户测试回归 | 列表/详情展示不回退 |
