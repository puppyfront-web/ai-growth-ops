# AI 全域内容获客运营系统 - 前端页面与设计 Spec v1

> 适用对象：Codex / Claude Code / Cursor / 前端开发工程师  
> 目标：指导一次性生成可运行、可扩展、可验收的前端页面结构与交互设计  
> 项目类型：单品牌自用的 AI 全域内容获客运营系统  
> 支持平台：抖音、小红书、微信公众号、微信视频号、百家号、知乎  
> 当前版本边界：不实现真实 AI 生图/生视频，但预留未来 `MediaGenerationProvider` 接入入口

---

## 0. 前端建设目标

本前端不是普通 CMS，也不是简单多平台发布工具，而是一个 **AI 获客运营工作台**。

核心业务链路：

```text
市场调研
→ 选题机会
→ 内容生产
→ 素材管理
→ 多平台发布
→ 评论私信承接
→ 客户意向识别
→ 飞书/企微沉淀
→ 数据复盘
```

前端必须满足：

1. **运营人员易用**：首页能看到今日待办、高意向线索、发布失败和平台异常。
2. **业务链路完整**：调研、内容、素材、发布、互动、线索、复盘都能串起来。
3. **平台能力透明**：每个平台明确展示支持能力、运行模式、授权状态和失败原因。
4. **AI 可控**：AI 生成内容、回复建议、线索评级必须可查看、可编辑、可人工确认。
5. **风险可控**：高风险回复、高意向客户、未审核素材、Browser Assist 发布都必须有人审节点。
6. **本地优先**：页面呈现所有核心数据来自本地系统，不把飞书/企微当作主数据库。
7. **未来可扩展**：预留 Media Generation、Provider、Skill、Webhook、n8n 等插件入口。

---

## 1. 技术栈要求

### 1.1 推荐技术栈

```text
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
TanStack Table
Zustand
React Hook Form
Zod
Recharts
dnd-kit
lucide-react
```

### 1.2 工程要求

```text
- 所有页面必须 TypeScript 强类型。
- 所有表单必须使用 React Hook Form + Zod 校验。
- 所有接口请求必须通过统一 api client。
- 所有列表必须支持 loading / empty / error / pagination 状态。
- 所有高风险操作必须二次确认。
- 所有 AI 输出必须可编辑，不允许不可控直接发送。
- 所有平台能力必须从 capability 配置读取，不允许前端硬编码。
- 所有状态标签必须统一使用 StatusBadge / RiskBadge / LeadLevelBadge。
```

---

## 2. 全局布局设计

### 2.1 页面结构

采用 B 端 SaaS 工作台布局：

```text
┌────────────────────────────────────────────────────────────┐
│ Topbar：品牌名 / 环境 / 全局搜索 / 通知 / 用户菜单           │
├───────────────┬────────────────────────────────────────────┤
│ Sidebar       │ Main Content                               │
│ 一级导航       │ 页面标题 / 操作区 / 筛选区 / 数据区 / 详情抽屉 │
│ 二级导航       │                                            │
└───────────────┴────────────────────────────────────────────┘
```

### 2.2 全局组件

```text
components/layout/
├── AppShell.tsx
├── Sidebar.tsx
├── Topbar.tsx
├── Breadcrumb.tsx
├── PageHeader.tsx
├── PageToolbar.tsx
└── RightDrawer.tsx
```

### 2.3 顶部栏 Topbar

展示：

```text
- 当前品牌名称
- 当前环境：Mock / Local / Production
- 全局搜索入口
- 通知中心
- 平台异常提示
- 当前用户菜单
```

### 2.4 左侧导航 Sidebar

一级导航：

```text
工作台
市场调研
内容运营
素材库
发布运营
评论私信
线索管理
数据复盘
集成配置
系统设置
```

导航要求：

```text
- 支持折叠。
- 当前路由高亮。
- 二级菜单可展开。
- 出现待处理数量时显示 badge。
- 平台异常、发布失败、高意向线索可显示红点提醒。
```

---

## 3. 路由结构

采用 Next.js App Router。

```text
app/
├── layout.tsx
├── page.tsx                         # redirect to /dashboard
├── login/page.tsx
│
├── dashboard/page.tsx
│
├── research/
│   ├── page.tsx
│   ├── new/page.tsx
│   ├── tasks/[id]/page.tsx
│   ├── insights/page.tsx
│   ├── opportunities/page.tsx
│   └── competitors/page.tsx
│
├── content/
│   ├── page.tsx
│   ├── new/page.tsx
│   ├── [id]/page.tsx
│   ├── calendar/page.tsx
│   ├── plans/page.tsx
│   ├── variants/page.tsx
│   └── templates/page.tsx
│
├── media/
│   ├── page.tsx
│   ├── upload/page.tsx
│   ├── folders/page.tsx
│   ├── review/page.tsx
│   └── generation/page.tsx           # 当前禁用，只展示未来接入说明
│
├── publish/
│   ├── page.tsx
│   ├── queue/page.tsx
│   ├── calendar/page.tsx
│   ├── jobs/[id]/page.tsx
│   ├── attempts/page.tsx
│   └── manual/page.tsx
│
├── conversations/
│   ├── page.tsx
│   ├── comments/page.tsx
│   ├── messages/page.tsx
│   ├── conversations/[id]/page.tsx
│   ├── replies/page.tsx
│   └── review/page.tsx
│
├── leads/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   ├── pipeline/page.tsx
│   ├── sync/page.tsx
│   └── rules/page.tsx
│
├── analytics/
│   ├── page.tsx
│   ├── content/page.tsx
│   ├── platform/page.tsx
│   ├── lead/page.tsx
│   ├── research/page.tsx
│   └── reports/page.tsx
│
├── integrations/
│   ├── page.tsx
│   ├── platforms/page.tsx
│   ├── feishu/page.tsx
│   ├── wecom/page.tsx
│   ├── providers/page.tsx
│   └── webhooks/page.tsx
│
└── settings/
    ├── page.tsx
    ├── profile/page.tsx
    ├── team/page.tsx
    ├── ai/page.tsx
    ├── skills/page.tsx
    ├── compliance/page.tsx
    ├── storage/page.tsx
    └── logs/page.tsx
```

---

## 4. 页面优先级

### 4.1 P0 必须实现

```text
/dashboard
/research
/research/new
/research/tasks/[id]
/research/insights
/research/opportunities
/content
/content/new
/content/[id]
/media
/media/upload
/media/review
/publish
/publish/jobs/[id]
/publish/manual
/conversations
/conversations/conversations/[id]
/conversations/review
/leads
/leads/[id]
/leads/pipeline
/analytics
/integrations/platforms
/integrations/feishu
/integrations/wecom
/integrations/providers
/settings/ai
/settings/skills
/settings/compliance
```

### 4.2 P1 增强页面

```text
/content/calendar
/content/templates
/publish/calendar
/publish/attempts
/conversations/replies
/analytics/content
/analytics/platform
/analytics/reports
/settings/team
/settings/logs
```

---

## 5. 设计系统规范

### 5.1 视觉风格

```text
风格：清爽、专业、B 端 SaaS、信息密度适中
圆角：rounded-xl / rounded-2xl
间距：8px 基础栅格
卡片：白底、浅边框、轻阴影
表格：紧凑但可读
颜色：使用 shadcn/ui 默认主题，不硬编码品牌色
状态：使用统一 Badge 组件
```

### 5.2 状态颜色语义

```text
success：成功、已发布、已同步、低风险
warning：待确认、处理中、中风险
danger：失败、高风险、异常、熔断
muted：草稿、未启用、无数据
info：AI 建议、Mock、辅助模式
```

### 5.3 通用状态组件

```text
StatusBadge
RiskBadge
LeadLevelBadge
PlatformBadge
PublishModeBadge
ProviderHealthBadge
SyncStatusBadge
ReviewStatusBadge
```

### 5.4 页面空状态

所有页面必须有 EmptyState：

```text
- 标题
- 说明
- 主操作按钮
- 可选文档链接
```

例：内容库为空：

```text
标题：还没有内容
说明：你可以从调研选题生成内容，也可以手动创建一条图文或视频脚本。
按钮：新建内容
```

---

## 6. 核心数据类型

前端必须定义以下类型，放在：

```text
src/types/
├── platform.ts
├── content.ts
├── media.ts
├── publish.ts
├── interaction.ts
├── lead.ts
├── research.ts
├── provider.ts
└── analytics.ts
```

### 6.1 平台枚举

```ts
export type Platform =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu';
```

### 6.2 发布模式

```ts
export type PublishMode =
  | 'official_api'
  | 'browser_assist'
  | 'manual_confirm'
  | 'mock';
```

### 6.3 内容类型

```ts
export type ContentType =
  | 'text_image'
  | 'video'
  | 'article'
  | 'qa_answer';
```

### 6.4 素材来源

```ts
export type MediaSourceType =
  | 'upload'
  | 'external_url'
  | 'future_generation'
  | 'imported';
```

### 6.5 素材审核状态

```ts
export type MediaReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected';
```

### 6.6 线索等级

```ts
export type LeadLevel = 'A' | 'B' | 'C' | 'D';
```

### 6.7 风险等级

```ts
export type RiskLevel = 'low' | 'medium' | 'high';
```

---

## 7. Dashboard 工作台

### 7.1 路径

```text
/dashboard
```

### 7.2 目标

运营人员进入系统后，立即知道：

```text
今天要发什么
哪些发布失败了
哪些评论/私信需要处理
有哪些高意向线索
哪些平台账号异常
AI 建议下一步做什么
```

### 7.3 页面区块

```text
1. KPI 总览卡片
2. 今日待办
3. 高意向线索
4. 发布状态
5. 评论私信待处理
6. 平台账号健康状态
7. AI 运营建议
```

### 7.4 KPI 卡片

```text
今日待发布
今日已发布
发布失败
新增互动
新增线索
A 级线索
待人工确认
平台异常
```

### 7.5 交互要求

```text
- 点击发布失败 → 跳转 /publish?status=failed
- 点击 A 级线索 → 跳转 /leads?level=A
- 点击待人工确认 → 跳转 /conversations/review
- 点击平台异常 → 跳转 /integrations/platforms
```

---

## 8. Research Ops 市场调研模块

### 8.1 业务定位

Research Ops 使用 MediaCrawler 进行低频公开数据调研，服务于选题、竞品分析、评论洞察。

必须在页面显著提示：

```text
仅用于单品牌自用的低频公开内容调研。
仅采集公开内容和公开评论。
不采集私信，不绕过平台风控，不做高频批量采集。
```

### 8.2 调研任务列表 `/research`

字段：

```text
任务名称
平台
任务类型
关键词/竞品账号
运行模式
状态
采集内容数
采集评论数
最近运行时间
失败原因
操作
```

操作：

```text
查看
立即运行
暂停
复制任务
删除
```

状态：

```text
idle
running
success
failed
paused
circuit_breaker
```

### 8.3 新建调研任务 `/research/new`

表单字段：

```text
任务名称
调研平台：小红书 / 抖音 / 知乎
任务类型：关键词搜索 / 竞品账号 / 评论采样
关键词
竞品账号 URL
采集内容数量上限
评论采样数量上限
运行频率
是否启用限频
是否启用失败熔断
备注
```

表单校验：

```text
任务名称必填
平台必选
关键词搜索必须填写关键词
竞品任务必须填写账号 URL
采集内容数量上限默认 <= 50
评论采样数量上限默认 <= 200
```

### 8.4 调研任务详情 `/research/tasks/[id]`

页面区块：

```text
任务信息
运行日志
采集内容列表
采集评论样本
AI 洞察
生成的选题机会
```

### 8.5 调研洞察 `/research/insights`

展示：

```text
高频用户问题
用户痛点聚类
热门内容结构
平台差异洞察
竞品高互动内容
AI 总结建议
```

### 8.6 选题机会 `/research/opportunities`

字段：

```text
选题标题
来源平台
来源证据
推荐发布平台
推荐内容形式
预估获客价值
优先级
状态
操作
```

操作：

```text
生成内容计划
生成内容草稿
忽略
标记已采用
```

---

## 9. Content Ops 内容运营模块

### 9.1 内容库 `/content`

字段：

```text
标题
内容类型
来源
状态
关联素材数
平台版本数
创建人
更新时间
操作
```

状态：

```text
draft
pending_review
ready
scheduled
published
archived
```

操作：

```text
编辑
生成平台版本
创建发布任务
归档
```

### 9.2 新建内容 `/content/new`

创建方式：

```text
手动创建
从选题机会创建
从模板创建
```

字段：

```text
标题
内容类型：图文 / 视频 / 文章 / 问答
正文文案
视频脚本
目标平台
关联素材
标签
备注
```

AI 文本能力：

```text
生成标题
生成正文
生成视频脚本
生成平台标签
生成评论引导语
```

禁止能力：

```text
不得实现真实 AI 生图
不得实现真实 AI 生视频
不得实现视频剪辑
不得实现配音
不得实现字幕生成
```

### 9.3 内容详情 `/content/[id]`

页面结构：

```text
左侧：内容编辑器
右侧：AI 助手面板
下方：平台版本 Tabs
侧边抽屉：操作日志 / 审核记录
```

AI 助手面板：

```text
AI 生成标题
AI 改写正文
AI 生成视频脚本
AI 生成平台版本
AI 合规检查
AI 生成评论引导语
```

所有 AI 输出必须：

```text
- 展示原始结果
- 可编辑
- 可采纳
- 可拒绝
- 记录 SkillRun
```

### 9.4 平台版本 `/content/variants`

平台版本字段：

```text
平台
标题
正文/简介
标签/话题
评论引导语
关联素材
合规状态
是否可发布
```

平台版本要求：

```text
抖音：短视频标题、简介、话题、评论引导
小红书：笔记标题、正文、标签、封面文案
公众号：文章标题、摘要、正文
视频号：视频标题、简介、话题
百家号：SEO 标题、摘要、正文
知乎：问题标题、回答正文、专业表达
```

---

## 10. Media Library 素材库

### 10.1 素材库 `/media`

展示方式：

```text
网格视图
列表视图
文件夹视图
```

筛选：

```text
素材类型
来源
审核状态
平台用途
上传时间
```

字段：

```text
预览图
文件名
素材类型
来源
审核状态
文件大小
关联内容数
上传时间
操作
```

### 10.2 上传素材 `/media/upload`

支持：

```text
图片上传
视频上传
封面上传
外部 URL 导入
批量上传
```

上传后默认状态：

```text
pending_review
```

### 10.3 素材审核 `/media/review`

审核操作：

```text
通过
拒绝
填写拒绝原因
查看素材详情
查看关联内容
```

规则：

```text
只有 approved 素材可以进入发布任务。
rejected 素材不能被选择发布。
pending_review 素材只能被内容草稿引用，不能发布。
```

### 10.4 未来生成入口 `/media/generation`

当前页面只展示禁用提示：

```text
当前版本暂不支持真实 AI 生图/生视频。
后续可通过 MediaGenerationProvider 接入第三方生成服务。
生成素材必须先进入素材库，并经过人工审核后才能发布。
```

页面按钮状态：

```text
全部 disabled
```

---

## 11. Publish Ops 发布运营模块

### 11.1 发布任务列表 `/publish`

字段：

```text
任务标题
关联内容
平台
账号
内容类型
发布模式
状态
计划发布时间
最近错误
操作
```

发布状态：

```text
draft
scheduled
queued
publishing
waiting_human_confirm
published
failed
cancelled
```

发布模式：

```text
official_api
browser_assist
manual_confirm
mock
```

### 11.2 发布任务详情 `/publish/jobs/[id]`

页面区块：

```text
任务基本信息
平台账号信息
内容版本预览
关联素材
发布参数
发布状态时间线
发布尝试记录
失败原因
人工确认记录
Provider 运行日志
```

操作：

```text
立即发布
重试
取消
进入人工发布
复制发布内容
标记成功
标记失败
```

高风险规则：

```text
未审核素材不可发布
合规检查失败不可发布
平台账号未授权不可发布
browser_assist 模式必须进入人工确认
manual_confirm 模式必须显示发布 Checklist
```

### 11.3 人工发布待办 `/publish/manual`

用于：

```text
平台 API 不可用
Browser Assist 等待登录
Browser Assist 等待人工确认
Manual Confirm 任务
发布失败后人工兜底
```

Checklist：

```text
复制标题
复制正文
下载/打开素材
打开平台后台
上传素材
粘贴文案
确认发布
填写发布 URL
标记完成
```

---

## 12. Conversation Ops 评论私信模块

### 12.1 统一收件箱 `/conversations`

筛选：

```text
平台
账号
内容来源
消息类型
线索等级
风险等级
处理状态
是否需要人工
```

字段：

```text
用户昵称
平台
消息类型
内容摘要
AI 意向
风险等级
处理状态
来源内容
创建时间
操作
```

消息类型：

```text
comment
private_message
official_account_message
manual_import
```

处理状态：

```text
unprocessed
ai_suggested
waiting_review
replied
converted_to_lead
ignored
```

### 12.2 会话详情 `/conversations/conversations/[id]`

页面结构：

```text
左侧：会话消息流
中间：回复输入框
右侧：AI 评估面板
底部：操作日志
```

AI 评估面板：

```text
意图识别
线索等级
置信度
风险等级
用户需求摘要
建议回复
建议动作
关联内容
```

操作：

```text
采纳 AI 回复
编辑后回复
转人工
标记为线索
同步飞书
同步企微
忽略
```

### 12.3 人工确认回复 `/conversations/review`

用于审核：

```text
高意向客户回复
中高风险回复
AI 低置信度回复
涉及导流的话术
投诉/差评/敏感内容
```

审核动作：

```text
通过并发送
编辑后发送
拒绝
转销售处理
标记为高风险
```

---

## 13. Lead Ops 线索管理模块

### 13.1 线索池 `/leads`

字段：

```text
线索名称
来源平台
来源内容
意向等级
需求摘要
负责人
跟进状态
飞书状态
企微状态
创建时间
操作
```

跟进状态：

```text
new
assigned
contacted
wechat_added
following
won
lost
invalid
```

操作：

```text
查看
分配负责人
同步飞书
同步企微
更新状态
标记无效
```

### 13.2 线索详情 `/leads/[id]`

页面区块：

```text
基础信息
来源内容
完整互动记录
AI 评级记录
跟进记录
飞书同步记录
企微同步记录
操作日志
```

### 13.3 跟进看板 `/leads/pipeline`

Kanban 列：

```text
新线索
待联系
已联系
已加企微
跟进中
已成交
无效
```

交互：

```text
支持拖拽变更状态
变更后写入 LeadActivity
A 级线索卡片高亮
超过 SLA 未跟进显示提醒
```

---

## 14. Analytics 数据复盘模块

### 14.1 复盘总览 `/analytics`

指标：

```text
发布内容数
互动总数
评论咨询数
私信咨询数
新增线索数
A 级线索数
飞书同步数
企微承接数
内容获客率
平台贡献占比
```

图表：

```text
平台线索趋势
内容获客排行
线索等级分布
发布成功率
互动转线索漏斗
```

### 14.2 内容分析 `/analytics/content`

回答问题：

```text
哪条内容带来最多线索？
哪类选题带来最多 A 级线索？
哪些平台版本表现最好？
哪些标题/标签更有效？
```

### 14.3 平台分析 `/analytics/platform`

按平台对比：

```text
发布数量
互动数量
评论数量
私信数量
线索数量
A 级线索数量
人工处理成本
获客效率
```

### 14.4 报告 `/analytics/reports`

报告类型：

```text
日报
周报
月报
内容复盘报告
线索复盘报告
平台复盘报告
```

AI 生成报告必须可编辑后导出。

---

## 15. Integrations 集成配置

### 15.1 平台账号 `/integrations/platforms`

展示 6 个平台卡片：

```text
抖音
小红书
微信公众号
微信视频号
百家号
知乎
```

每个卡片展示：

```text
授权状态
运行模式
支持能力
最近同步时间
异常状态
限频状态
操作按钮
```

能力矩阵：

```text
图文发布
视频发布
评论同步
评论回复
私信/消息同步
自动回复
数据分析
```

### 15.2 飞书配置 `/integrations/feishu`

字段：

```text
App ID
App Secret
多维表格 App Token
Table ID
字段映射
群机器人 Webhook
同步开关
测试连接
```

### 15.3 企微配置 `/integrations/wecom`

字段：

```text
企业 ID
应用 Agent ID
应用 Secret
客户联系配置
销售成员列表
联系我二维码配置
标签映射
测试连接
```

### 15.4 Provider 配置 `/integrations/providers`

Provider：

```text
OfficialApiProvider
BrowserAssistProvider
MediaCrawlerResearchProvider
SocialAutoUploadProvider
XiaohongshuSkillProvider
WechatSyncProvider
MockProvider
DisabledMediaGenerationProvider
MockMediaGenerationProvider
```

展示字段：

```text
启用状态
运行模式
版本
健康状态
最近运行时间
失败次数
配置入口
```

---

## 16. Settings 系统设置

### 16.1 AI 配置 `/settings/ai`

字段：

```text
LLM Provider
API Key
模型名称
温度
最大 tokens
每日 token 限额
文本生成开关
线索识别开关
回复建议开关
```

### 16.2 Skill 管理 `/settings/skills`

Skill：

```text
内容生成 Skill
平台改写 Skill
合规检查 Skill
线索识别 Skill
回复建议 Skill
调研洞察 Skill
飞书同步 Skill
企微跟进 Skill
```

每个 Skill 展示：

```text
名称
版本
启用状态
最近运行
成功率
平均耗时
配置入口
```

### 16.3 合规规则 `/settings/compliance`

配置：

```text
敏感词
禁用话术
平台导流规则
自动回复限制
高风险行业规则
人工确认规则
```

---

## 17. 前端组件目录

```text
src/components/
├── layout/
│   ├── AppShell.tsx
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   ├── Breadcrumb.tsx
│   └── PageHeader.tsx
│
├── dashboard/
│   ├── KpiCard.tsx
│   ├── TaskList.tsx
│   ├── LeadAlertList.tsx
│   └── PlatformStatusGrid.tsx
│
├── research/
│   ├── ResearchTaskTable.tsx
│   ├── ResearchTaskForm.tsx
│   ├── InsightCard.tsx
│   ├── CommentClusterChart.tsx
│   └── OpportunityList.tsx
│
├── content/
│   ├── ContentTable.tsx
│   ├── ContentEditor.tsx
│   ├── PlatformVariantTabs.tsx
│   ├── AiWritingPanel.tsx
│   └── ContentStatusBadge.tsx
│
├── media/
│   ├── MediaGrid.tsx
│   ├── MediaUploader.tsx
│   ├── MediaPreview.tsx
│   └── MediaReviewBadge.tsx
│
├── publish/
│   ├── PublishJobTable.tsx
│   ├── PublishStatusTimeline.tsx
│   ├── PublishModeBadge.tsx
│   ├── PublishAttemptLog.tsx
│   └── ManualPublishChecklist.tsx
│
├── conversations/
│   ├── InboxTable.tsx
│   ├── ConversationThread.tsx
│   ├── ReplyComposer.tsx
│   ├── AiReplyPanel.tsx
│   └── RiskBadge.tsx
│
├── leads/
│   ├── LeadTable.tsx
│   ├── LeadDetailPanel.tsx
│   ├── LeadLevelBadge.tsx
│   ├── LeadPipelineBoard.tsx
│   └── LeadSyncStatus.tsx
│
├── analytics/
│   ├── AnalyticsKpiGrid.tsx
│   ├── PlatformPerformanceChart.tsx
│   ├── ContentLeadRanking.tsx
│   └── ReportList.tsx
│
├── integrations/
│   ├── PlatformAccountCard.tsx
│   ├── CapabilityMatrix.tsx
│   ├── ProviderHealthCard.tsx
│   ├── FeishuConfigForm.tsx
│   └── WeComConfigForm.tsx
│
└── shared/
    ├── DataTable.tsx
    ├── StatusBadge.tsx
    ├── ConfirmDialog.tsx
    ├── EmptyState.tsx
    ├── ErrorState.tsx
    ├── LoadingState.tsx
    ├── AuditLogDrawer.tsx
    └── AiResultCard.tsx
```

---

## 18. 前端 API Client 规范

目录：

```text
src/lib/api/
├── client.ts
├── dashboard.ts
├── research.ts
├── content.ts
├── media.ts
├── publish.ts
├── conversations.ts
├── leads.ts
├── analytics.ts
├── integrations.ts
└── settings.ts
```

统一返回格式：

```ts
export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

分页格式：

```ts
export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

---

## 19. Mock 数据要求

前端第一阶段必须支持 Mock 数据，以便在后端未完成时独立开发。

目录：

```text
src/mocks/
├── dashboard.mock.ts
├── research.mock.ts
├── content.mock.ts
├── media.mock.ts
├── publish.mock.ts
├── conversations.mock.ts
├── leads.mock.ts
├── analytics.mock.ts
├── integrations.mock.ts
└── settings.mock.ts
```

Mock 数据必须覆盖：

```text
6 个平台账号
12 个发布任务：6 个图文 + 6 个视频
3 个失败发布任务
10 条评论/私信
4 个 A 级线索
3 条调研任务
5 条选题机会
飞书/企微同步成功和失败记录
Provider 健康和异常状态
```

---

## 20. 前端验收标准

### 20.1 基础验收

```text
- 所有 P0 路由可访问。
- 左侧导航可正确跳转。
- 所有列表有 loading / empty / error 状态。
- 所有表单有 Zod 校验。
- 所有危险操作有确认弹窗。
- 所有页面支持 Mock 数据渲染。
```

### 20.2 业务验收

```text
- 能从调研任务生成选题机会。
- 能从选题机会创建内容。
- 能为内容生成 6 平台版本。
- 能上传素材并审核通过。
- 未审核素材不能创建发布任务。
- 能创建 6 平台图文/视频发布任务。
- 发布失败能看到失败原因和重试入口。
- 能在统一收件箱查看评论/私信。
- 能查看 AI 意向评级和回复建议。
- A 级线索能进入线索池。
- 线索能显示飞书/企微同步状态。
- Analytics 能展示内容、平台、线索指标。
```

### 20.3 风险控制验收

```text
- 高风险回复不能直接自动发送。
- Browser Assist 发布必须进入人工确认。
- DisabledMediaGenerationProvider 页面不可触发真实生成。
- future_generation 素材未审核不能发布。
- 平台账号未授权时不能创建 official_api 发布任务。
```

---

## 21. 前端 TDD / 测试建议

### 21.1 测试工具

```text
Vitest
React Testing Library
Playwright E2E
MSW Mock API
```

### 21.2 单元测试重点

```text
StatusBadge 渲染
LeadLevelBadge 渲染
PublishStatusTimeline 状态顺序
ManualPublishChecklist 完成逻辑
MediaReviewBadge 状态显示
CapabilityMatrix 能力展示
Zod 表单校验
```

### 21.3 E2E 测试用例

```text
用例 1：调研任务 → 选题机会 → 创建内容
用例 2：内容 → 平台版本 → 上传素材 → 创建发布任务
用例 3：未审核素材不可发布
用例 4：发布失败 → 查看日志 → 重试
用例 5：评论进入收件箱 → AI 评级 → 转线索
用例 6：A 级线索 → 同步飞书/企微
用例 7：高风险回复必须人工确认
用例 8：Media Generation 页面当前不可触发真实生成
```

---

## 22. Codex / Claude Code 前端生成 Prompt

```text
你是资深前端工程师。请根据《AI 全域内容获客运营系统 - 前端页面与设计 Spec v1》生成 Next.js App Router 前端项目。

技术栈：Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + TanStack Table + React Hook Form + Zod + Recharts + dnd-kit。

要求：
1. 先生成项目目录和类型定义。
2. 先实现全局布局 AppShell、Sidebar、Topbar、PageHeader。
3. 实现 Mock API 和 mock 数据。
4. 按 P0 页面优先级逐步实现页面。
5. 所有列表必须有 loading / empty / error 状态。
6. 所有表单必须有 Zod 校验。
7. 所有 AI 输出必须可编辑、可采纳、可拒绝。
8. 高风险操作必须二次确认。
9. 当前版本不得实现真实 AI 生图、生视频、剪辑、配音、字幕功能。
10. /media/generation 只显示禁用说明和未来 Provider 接入说明。
11. 生成必要测试，优先覆盖素材审核、发布任务、评论转线索、人工确认回复。

开发顺序：
M1：项目骨架、布局、导航、Mock 数据
M2：Dashboard
M3：Research Ops
M4：Content Ops + Media Library
M5：Publish Ops
M6：Conversation Ops + Lead Ops
M7：Analytics + Integrations + Settings
M8：E2E 测试和体验优化
```

---

## 23. 最终前端建设原则

```text
1. 页面必须围绕业务闭环，而不是功能堆叠。
2. 平台差异必须可视化，不能假装所有平台能力一致。
3. AI 必须辅助人，而不是绕过人。
4. 高价值线索必须突出显示。
5. 发布、回复、同步都必须可追踪。
6. 本地数据是主数据，飞书/企微只是外部沉淀目标。
7. 当前不做真实生图生视频，但预留未来 Provider 接入。
```

---

## 24. 一句话总结

前端应实现一个完整的 AI 获客运营工作台：

```text
从公开调研发现机会，
到内容策划和素材管理，
再到 6 平台发布，
再到评论私信承接和客户意向识别，
最后沉淀飞书/企微并完成运营复盘。
```

当前版本重点不是做炫酷页面，而是让运营人员能清楚看到：

```text
今天该发什么，
哪里发布失败，
哪些客户最有意向，
哪些回复需要人工确认，
哪些内容真正带来了客户。
```
