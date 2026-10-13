# UI 去模板化改造升级可行性方案

> 状态：提案（待评审）
> 范围：apps/web 全部界面（69 个页面）
> 辅助工具：Google Stitch（stitch.withgoogle.com，免费，Gemini 驱动）

---

## 1. 问题诊断：这个 UI 的"AI 味"到底是什么

先说结论：我们的 UI **不是**"紫色渐变 + 玻璃拟态"那种一眼假的 AI slop，而是更隐蔽的一类：**AI 编程脚手架的默认脸**。v0 / Claude / Cursor 这类工具生成前端时的默认选择组合，我们全部命中。用户和客户说"AI 味重"，指的正是这种"每个决策都取了最不出错的默认值、没有任何人为设计决策"的观感。

### 1.1 量化审计结果

| 指标 | 数值 | 说明 |
|---|---|---|
| 页面总数 | 69 | `src/app/**/page.tsx` |
| 使用同一 PageHeader 模板的页面 | 58 (84%) | 标题 + 一句解释 + 右侧按钮，三件套完全一致 |
| 硬编码调色板颜色（绕过 token） | 208 处 | `text-emerald-500`、`text-blue-500`、`bg-yellow-100` 等 |
| 图标库 | lucide-react | AI 脚手架默认项 |
| 字体 | Inter Variable | AI 脚手架默认项，中文回落 PingFang/雅黑，无中文字体决策 |
| 设计 token | shadcn 初始化默认值 | `--primary: 173 58% 39%`（teal）、radius 0.75rem、蓝灰中性色，全是 `npx shadcn init` 的出厂设置 |
| 引导流程 | 13 步弹窗式 tour | 过度解释，AI 生成物典型特征 |

### 1.2 六个具体病灶（附证据）

**① 品牌缺位。** Logo 是一个 teal 圆角方块写着 "AI"（`Sidebar.tsx:35`），占位符级别。全站没有任何品牌资产：无字体个性、无图形语言、无专属插画/图标风格。"AI Growth Ops" 这个名字本身也是描述性拼接词。

**② "每页一句 AI 解说词"。** 58 个页面共用 PageHeader 的 `description` 槽位，每页顶部都有一句灰色说明文字，如"描述目标客户和业务需求，由系统组合多种策略发现高意向潜客""配置 AI 模型 · 驱动评论分级、回复生成、敏感内容审核"。这是 LLM 生成 UI 的标志性节奏：每个模块都要自我解释一遍。人对"AI 味"的直觉很大程度来自这种**过度解释感**。成熟产品只在真正需要教育的页面放说明。

**③ 色彩一致性崩坏。** 主色 teal，但 208 处直接写调色板色：dashboard 卡片图标 emerald/blue/amber 三色混排（`dashboard/page.tsx:102,145,181`）、警告横幅橙色按钮（截图 `t2_new_user_guide.png`）、帮助卡片蓝色链接（`t4_llm_config.png`）、顶栏 Mock/Live 徽章 yellow/blue（`Topbar.tsx:16-17`）。没有一条"什么时候用什么颜色"的规则，是逐个补丁堆出来的。

**④ 信息密度两极分化。** 智能获客列表页：3 行表格配一整屏空白，页面重心失衡；工作台首页：6+ 张卡片纵向堆叠，卡片里再套边框行，盒中盒中盒（`Card > border p-3 rounded-lg > hover:bg-accent/50`）。该密的地方（数据表）稀，该留白的地方（列表空态）挤。

**⑤ 表格工艺缺陷。** 列宽未管理，中文竖排折行："平台"列显示"抖/音"两行、"状态"列显示"已完/成"两行（截图 `t2_prospecting.png` 表头"潜在客/数"同样折行）。缺 `whitespace-nowrap`、缺列宽规范、缺 `tabular-nums` 数字对齐。这类细节是"模板感"和"专业感"的分水岭。

**⑥ Emoji 当图标。** `✨ 新对话`（ChatSidebar.tsx:66）、`💡`、`🎯 意向客户`（tool-renderers.tsx:445,557）。与 lucide 线性图标混用，渲染风格不一致。

### 1.3 根因

AI 生成代码时没有设计决策输入，它只能选"统计上最安全"的默认值。**根因不是代码写得差，而是从未有人做过设计决策**。所以改造的核心动作不是"重画页面"，而是**补上设计决策层，然后把决策固化成 token 和组件规范**，让 69 个页面自动继承。

---

## 2. 改造定位

- 本产品是 **B2B 运营工具（dashboard 类）**，改造方向是"专业工具感"（Linear / Notion / 飞书项目这一族），不是营销页的炫技方向。
- **不换技术栈、不换 shadcn/Radix 体系、不改 IA 和路由**。shadcn 的优势就是代码归我们所有，"never ship default state"是它的正确用法。现有问题恰是用了默认状态。
- 保留现有暗色模式能力和无障碍达标项，不回归。

**为什么可行（核心论据）**：项目已有完整的 token 化架构（`globals.css` HSL 变量 + `tailwind.config.ts` 映射 + `cva` 组件体系）。这意味着 70% 的"去 AI 味"动作（换色板、换字体、改密度、改圆角、调间距节奏）**只需要改 token 层，69 个页面自动生效**，不需要逐页重写。剩余 30% 是骨架组件（PageHeader/Sidebar/DataTable）和 4-5 个高价值页面的定向重做。

---

## 3. 目标设计方向（已拍板：A 冷静专业）

**2026-10-13 决策：采用方向 A「冷静专业」**，即"做减法的 Linear 感"：中性灰阶（zinc 系）+ 单一去饱和强调色，状态色收编为语义 token。定稿 token 已落地于 `apps/web/src/app/globals.css`（同日），要点：

- **中性色**：全站统一 zinc 色相（HSL 色相 240，饱和度 <10%），替换原 shadcn 出厂的蓝灰 slate（222.2/215/210 混用）
- **强调色**：唯一强调色为去饱和深 teal（光 `173 45% 32%` / 暗 `173 38% 55%`），饱和度 38-45%，符合 <70% 约束；仅用于主按钮、链接、focus ring、激活态
- **语义状态色**：`--success / --warning / --info / --destructive` 四族，配 `<alpha-value>` 钩子支持 `/10` 底色 `/25` 描边的 tint 用法；**只允许出现在语义组件**（Badge/Alert/Toast/状态点）
- **圆角三级体系**：`--radius: 0.625rem`（10px），映射后 sm 6px（chips）/ md 8px（输入与按钮）/ lg 10px（卡片）
- **字体决策（修订）**：保留 Inter Variable（自托管），不再引入第三种品牌字体。理由：方向 A 即"Linear 风格中性"，Linear 本身使用 Inter；中文走系统栈（PingFang/雅黑）。排版重心放在 `tabular-nums`（数据表格数字对齐）与字重纪律
- **暗色模式**：zinc 深底（背景 240 8% 6%，卡片 240 6% 9.5%），success/warning/info 补齐暗色定义（原文件缺失）

无论后续哪个页面改造，以下**设计决策清单**是硬约束（用于约束 Stitch 生成物和人工实现，防止"换一种 AI 模板脸"）：

1. **一个强调色**，全站唯一，饱和度 <70%；状态色（成功/警告/危险/信息）只允许出现在语义组件（Badge/Alert/Toast）中
2. **一套圆角体系**：输入/按钮/卡片三级圆角，写进 token，不允许混用
3. **中文字体策略**：正文系统栈（PingFang/雅黑，保性能），**数字与拉丁字符引入品牌字体**（候选：MiSans / HarmonyOS Sans / Geist，自托管），数据表格启用 `tabular-nums`
4. **密度提升**：数据区行高收紧（表格行高 ~44px），减少嵌套盒，用 `divide-y` 和留白替代部分卡片边框
5. **零 emoji 图标**，全站图标单一家族，统一 strokeWidth
6. **删除默认解说词**：PageHeader description 仅保留在有真实教育需求的页面（预计 <15 页），其余删掉
7. **表格列宽规范**：状态/平台类窄列 `whitespace-nowrap` + 固定宽度；需求/标题列 `min-w` + 截断
8. **引导重做**：13 步 tour 改为空态内嵌的渐进式引导（checklist 常驻侧栏或空态卡片），不再全屏打断
9. **零 emoji 图标**，全站图标单一家族（lucide 已是现状，统一即可），数据语境的语义色只走 token

### 3.1 P1/P2/P4 落地进度（2026-10-13，两轮）

**第一轮（token 定稿 + 共享组件）**：

- `apps/web/src/app/globals.css`（token 定稿，含暗色语义色补齐）
- `apps/web/tailwind.config.js`（success/warning/info 三族语义色 + alpha 钩子）
- `StatusBadge / Topbar / Sidebar / dashboard 首页 / chat 组件`（语义色 + logo + emoji）

**第二轮（全站清扫 + 骨架工艺）**：

- **硬编码色清零**：脚本化映射 `bg-*-50 text-*-700 border-*-200` + `dark:*` 成对组合 → 语义 tint（67 文件），异色（purple/sky/rose/cyan）逐处语境化处理；装饰性彩虹图标统一 muted-foreground；`settings/team` admin 徽章用 primary tint。修复脚本正则重叠产生的 23 处 `/100` 透明度伪影
- **表格折行修复**：DataTable 表头 `whitespace-nowrap`（9+ 列表页受益）；智能获客表格表头/平台/状态/时间列 nowrap，数字列 `tabular-nums`
- **Sidebar 导航分组**：获客 / 运营 / 配置 三组，`navigation.ts` 增加 `group` 字段，收起态不显示组标签
- **解说词清理**：删除 39 条复述标题的 PageHeader description，保留 13 条（6 条数据驱动如"N 条回复待审核"、7 条真实教学如 Webhook 说明、拖拽提示）；54 → 13
- **Emoji 清零**：`platformIcons` 从 emoji 字符串改为 lucide 组件（新增共享组件 `PlatformIcon.tsx`，抖音=Music2、小红书=BookOpen、公众号=MessageCircle、视频号=Video、百家号=Newspaper、知乎=Lightbulb，未知平台回落 Globe）；chat 工具渲染器 ✅❌⏳📋💬 状态符全部移除或换图标；media 文件类型 🖼️/🎬 → ImageIcon/VideoIcon。LLM prompt 字符串中的 emoji 不属于 UI，保留
- 附带修复：`客户管理`/`线索管理` 图标重复（UserCheck → Users）

已验证：`pnpm typecheck` 通过；`pnpm build` 全页面编译通过（98 文件改动，+570/-1098 行）。

**第三轮（P3/P4：引导重做 + 首页密度 + 数据可视化诚实性）**：

- **13 步 tour 重做**：`UserGuide.tsx` 从聚光灯分步引导（311 行，13 步弹窗 + 圆点分页 + 全局 scroll 监听）改为单屏模块总览卡（120 行）：一屏看完 8 个模块（图标 + 说明 + 可点击直达），Esc/点击外部关闭，`reopenUserGuide` 机制保留
- **假图表修复**：`LeadFunnelCard` 的四级漏斗条共用同一宽度公式（无分级数据，属假数据可视化），改为诚实的单条"互动 → 合格线索"转化条 + 比例说明
- **日历色语义化**：`calendarItemColors`（.ts 层，前两轮清扫未覆盖）从 10 组 `bg-*-400 dark:bg-*-600` 改为语义 token（PUBLISHED=success、SCHEDULED/WAITING_HUMAN_CONFIRM=warning、FAILED/NEED_MANUAL_REPAIR=destructive、DRAFT 等=muted-foreground、content=primary）
- **QuickActions 图标静音**：删除 color 字段，操作图标统一 muted-foreground；MetricGrid 修复"发布任务/已发布"图标重复（ClipboardList/Send）

### 3.2 剩余待办

- P2 收尾：PageHeader 变体化（紧凑/带工具栏）、列表页盒中盒减层（`divide-y` 替代嵌套边框）
- P3：integrations 重构页面（进行中）套用新规范验收；获客详情页与 settings 抽查
- 可选：Stitch 生成 dashboard/prospecting 布局变体作对照（prompt 模板见 4.2 节）

---

## 4. Stitch 辅助工作流（怎么用、边界在哪）

### 4.1 Stitch 能力现状（2026-10 核实）

- Google Labs 出品，**免费**，免费档约 350 次生成/月；付费档绑定 Google AI Pro/Ultra
- 输入：自然语言 prompt / **现有截图再设计** / 手绘草图；输出：可交互原型 + **HTML/Tailwind 代码** + **一键导出 Figma**
- 2026 年 3 月 "vibe design" 更新：无限画布、设计 agent、MCP 集成、多人协作
- 已知问题：3 月更新后社区有生成质量回退报告；代码导出是"起点不是成品"

### 4.2 工作流：Stitch 只做"方向探索"，不做"代码来源"

```
第 1 步  设计决策（本文档第 3 节清单，人工拍板）
   ↓
第 2 步  Stitch 探索：上传现有截图 + 决策清单写成 prompt，
         对 dashboard / prospecting / integrations / settings 四个代表页
         各生成 3-4 版视觉方向，导出 Figma
   ↓
第 3 步  团队评审定稿 1 版，在 Figma 里微调（Stitch 生成物必经人工修整）
   ↓
第 4 步  从定稿稿反提设计 token（色板/圆角/间距/字体），落入 globals.css
   ↓
第 5 步  人工用现有 shadcn 组件实现，Stitch 的 HTML 代码只作参考对照，不直接粘贴
   ↓
第 6 步  逐页验收（第 6 节清单）
```

**关键风险与对策：Stitch 本身也是 AI 设计工具，直接让它"自由发挥"会得到另一种模板脸**（它擅长的恰是紫色渐变和大圆角卡片）。对策是把第 3 节决策清单逐条写进 prompt 作为约束。Prompt 模板示例（用于 dashboard 首页）：

> Redesign this B2B ops dashboard screenshot. Constraints: neutral zinc palette with ONE desaturated teal accent used only for interactive elements; status colors only inside badges; compact data density (table rows ~44px); radius system: inputs 6px / buttons 8px / cards 10px, no exceptions; no gradients, no glows, no glassmorphism, no emojis; numbers use tabular-nums; reduce card nesting, use dividers instead of boxes where possible; Chinese UI text; professional tool feel like Linear app, NOT like a marketing site.

### 4.3 成本

- Stitch：0 元（免费档额度对 4 页 × 4 版探索绰绰有余）
- 人力：见下表，总盘约 12-16 人日，可拆成独立 PR 分批上线，每批可独立回滚

---

## 5. 实施分期

| 期 | 内容 | 交付物 | 工作量 | 风险 |
|---|---|---|---|---|
| **P0 设计定调** | 三方向评审拍板；Stitch 生成 4 代表页 × 3-4 版；Figma 定稿；反提 token 清单 | 定稿稿 + token 清单 | 2-3 人日 | 决策拖延（限一次评审会解决） |
| **P1 Token 层重构** | globals.css 重写（色板/字体/圆角/密度变量）；建立语义状态色 token；替换 208 处硬编码色；引入品牌数字字体；全站 tabular-nums | 1 个 PR，全站视觉自动更新 | 3-4 人日 | 需全页回归截图对比；暗色模式双测 |
| **P2 骨架组件升级** | PageHeader 变体化（紧凑/带工具栏/带说明三形态）；Sidebar 分组+品牌区+产品名；Topbar 环境徽章弱化为小字；DataTable 列宽规范+空态+密度选项；Badge 语义色收编 | 1-2 个 PR | 3-4 人日 | PageHeader 是 58 页公共依赖，保持向后兼容 props |
| **P3 高价值页面重做** | dashboard 首页（密度重组、去盒中盒）；prospecting 列表+详情（核心流程）；integrations（当前迭代中的页面直接用新规范做）；settings 抽查改造 | 3-4 个 PR | 3-4 人日 | 每页需真实数据态+空态+错误态三态验收 |
| **P4 文案与引导** | 清理 43+ 页默认解说词（保留确需教育的）；emoji 替换；13 步 tour → 渐进式 checklist；文案去"AI 腔" | 1-2 个 PR | 1-2 人日 | 文案改动需逐页过 |

P1 完成即上线"换了层皮"，性价比最高；P2 解决工艺缺陷（表格折行等）后，专业感提升立竿见影。

### 不做的事（明确边界）

- 不换组件库（不上 Fluent/Carbon/AntD，shadcn 定制路线成本最低且已就位）
- 不改路由/IA/字段名（保护埋点和用户肌肉记忆）
- 不做营销页炫技（无 3D、无滚动叙事，工具产品不需要）
- 不在本方案内重画 logo（品牌命名+Logo 是独立课题，但 P1 至少把 logo 字块从 "AI" 换成正式标识或去掉字块只留产品名）

---

## 6. 验收清单（每页过一遍）

- [ ] 全站只有一个强调色；状态色只出现在 Badge/Alert/Toast
- [ ] 圆角符合三级体系，无任意 rounded-*
- [ ] 表格无中文竖排折行；数字列右对齐 + tabular-nums
- [ ] 无 emoji 图标；图标同族同 stroke
- [ ] 页面无默认解说词（或属于白名单页面）
- [ ] 空态有引导动作，非一句"暂无数据"
- [ ] 亮/暗两模式对比度均过 WCAG AA
- [ ] 数据密度：一屏内信息量合理，无"3 行数据配整屏空白"，无盒中盒超过两层
- [ ] 交互三态齐全：loading（骨架屏）/ empty / error

---

## 附录 A：证据文件索引

- 设计 token：`apps/web/src/app/globals.css`（shadcn 默认值）
- 组件 token 映射：`apps/web/tailwind.config.ts`
- 模板三件套：`apps/web/src/components/layout/PageHeader.tsx`（58 页复用）
- 硬编码色示例：`apps/web/src/app/(dashboard)/dashboard/page.tsx:102,145,181`；`Topbar.tsx:16-17`
- 表格折行截图：`gui-test-screenshots/t2_prospecting.png`
- 过度解释截图：`gui-test-screenshots/t2_new_user_guide.png`（警告横幅橙色按钮）、`t4_llm_config.png`（蓝色链接卡）、`failure.png`（13 步 tour）
- Emoji：`src/components/chat/ChatSidebar.tsx:66`、`src/components/chat/tool-renderers.tsx:445,557`

## 附录 B：Stitch 资料来源

- Google Labs 官方博客 "Introducing vibe design with Stitch"（2026-03）：https://blog.google/models-and-research/google-labs
- Stitch 入口：https://stitch.withgoogle.com
- 定价与限制（~350 次/月免费档）以官方控制台实时显示为准
