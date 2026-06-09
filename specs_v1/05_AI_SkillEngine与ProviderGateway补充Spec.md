# AI Skill Engine 与 Provider Gateway 补充 Spec v1.0

> 解决问题：之前 Spec 多次提到 Skill、Provider、开源复用，但缺少统一执行协议、输入输出 Schema、版本管理、运行日志、隔离策略和 Provider Gateway 设计。

---

## 1. 模块定位

Skill Engine 负责 AI 能力编排：

```text
内容生成
平台改写
合规检测
评论意向识别
回复建议
调研洞察
复盘报告
```

Provider Gateway 负责外部能力隔离：

```text
官方 API
Browser Assist
MediaCrawler
social-auto-upload
xiaohongshu-skills
Wechatsync
飞书/企微
未来媒体生成 Provider
```

---

## 2. Skill 目录结构

```text
skills/
├── content-writing/
├── platform-rewrite/
├── compliance-check/
├── lead-classification/
├── reply-suggestion/
├── research-insight/
├── growth-review/
├── feishu-lead-sync/
└── wecom-followup/
```

每个 Skill 必须包含：

```text
SKILL.md
schema/input.schema.json
schema/output.schema.json
examples/
tests/
```

---

## 3. 数据模型

### 3.1 SkillDefinition

```prisma
model SkillDefinition {
  id          String   @id @default(cuid())
  name        String
  version     String
  description String?
  inputSchema Json
  outputSchema Json
  status      String
  createdAt   DateTime @default(now())

  @@unique([name, version])
}
```

### 3.2 SkillRun

```prisma
model SkillRun {
  id             String   @id @default(cuid())
  skillName      String
  skillVersion   String?
  status         String
  inputSummary   Json?
  outputSummary  Json?
  errorCode      String?
  errorMessage   String?
  modelProvider  String?
  modelName      String?
  tokenUsage     Json?
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime @default(now())
}
```

### 3.3 ProviderRunLog

```prisma
model ProviderRunLog {
  id              String   @id @default(cuid())
  providerName    String
  providerType    String
  mode            String
  status          String
  requestSummary  Json?
  responseSummary Json?
  errorCode       String?
  errorMessage    String?
  durationMs      Int?
  screenshotKey   String?
  createdAt       DateTime @default(now())

  @@index([providerName, status])
}
```

---

## 4. Skill 执行协议

```ts
export interface SkillRunner {
  run<TInput, TOutput>(input: {
    skillName: string;
    skillVersion?: string;
    input: TInput;
    context?: SkillContext;
  }): Promise<SkillRunResult<TOutput>>;
}
```

规则：

```text
1. 运行前校验 input schema。
2. 运行后校验 output schema。
3. 失败必须写 SkillRun。
4. 不允许无结构化输出。
5. 不允许直接返回不可解析文本。
6. Token 用量必须记录。
```

---

## 5. Provider Gateway 接口

```ts
export interface ExternalProvider {
  name: string;
  type: string;
  mode: ProviderMode;
  healthCheck(): Promise<ProviderHealth>;
}
```

ProviderMode：

```text
real
sandbox
recorded
browser_assist
manual
disabled
```

Gateway 规则：

```text
1. 业务模块不能直接调用开源工具。
2. 必须通过 Provider Gateway。
3. Provider 必须记录 ProviderRunLog。
4. Provider 失败不能污染主数据。
5. Provider 输出必须经过 schema 校验。
6. Provider 能力必须可查询。
```

---

## 6. API 设计

```http
GET /api/skills
GET /api/skills/:name
POST /api/skills/:name/run
GET /api/skill-runs
GET /api/skill-runs/:id
GET /api/providers
GET /api/providers/:name/health
PATCH /api/providers/:name
GET /api/provider-run-logs
```

---

## 7. 前端页面

| 页面              | 路径                           |
| ----------------- | ------------------------------ |
| Skill 管理        | /settings/skills               |
| Skill 运行记录    | /settings/skills/runs          |
| Provider 管理     | /integrations/providers        |
| Provider 健康检查 | /integrations/providers/[name] |

---

## 8. 测试验收

必须测试：

```text
1. Skill input schema 校验失败会阻止运行。
2. Skill output schema 校验失败会写失败日志。
3. lead-classification 输出必须包含 leadLevel/confidence/riskLevel。
4. reply-suggestion 输出必须包含 suggestedText/needReview。
5. Provider healthCheck 可运行。
6. Provider 失败写 ProviderRunLog。
7. Disabled Provider 调用返回明确错误。
8. 业务模块不能绕过 Provider Gateway。
9. OpenSource Provider 输出必须被 normalize。
10. SkillRun 记录 tokenUsage。
```
