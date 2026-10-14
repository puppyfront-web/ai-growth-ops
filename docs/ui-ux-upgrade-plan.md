# UI/UX 升级方案（第二阶段）：视觉工艺轨 + 交互体验轨

> 状态：**已实施完成（2026-10-14）**——实施记录见文末「实施进度」；交互规范另见 `docs/interaction-spec.md`
> 前置：`docs/ui-redesign-plan.md`（第一阶段「去模板化」）——设计方向 A「冷静专业」已拍板，token 层定稿，三轮改造已于 2026-10-13 完成
> 范围：apps/web 全部界面（69 个页面，162 个 tsx，约 2.5 万行）
> 审计基准：2026-10-14 代码扫描（本文所有数字均为当日实测）

---

## 1. 现状分析

### 1.1 第一阶段已完成（不再重复投入）

- **Token 层定稿且执行极佳**：zinc 中性色 + 单一去饱和 teal 强调色 + success/warning/info 语义色（含暗色定义，`globals.css:33-66`）；业务代码中 `text-[#hex]` 任意色 **0 处**，调色板直写色从 208 处降到 **12 处**
- **骨架统一**：Breadcrumb + PageHeader + DataTable 模式覆盖主要列表页；Sidebar 按「获客/运营/配置」分组
- **工艺修复**：表格折行（whitespace-nowrap + tabular-nums）、emoji 图标清零（PlatformIcon 统一）、解说词 54→13、13 步 tour 改单屏总览
- **反馈组件齐备**：EmptyState / ErrorState / LoadingState / DataTableSkeleton / ConfirmDialog / StatusBadge 已沉淀在 `components/shared/`
- 错误边界（`app/error.tsx` + `(dashboard)/error.tsx`）、暗色模式能力、E2E（Playwright）均已就位

**定位结论**：当前是一个「有纪律的 shadcn 半成品」。第一阶段解决的是"长什么样"，第二阶段分两条轨：**视觉工艺轨**解决"每个角落是否都按标准长"，**交互体验轨**解决"用户能不能顺畅地把活干完"。

### 1.2 视觉与工艺差距（五项，实测）

| # | 差距 | 实测证据 | 影响 |
|---|---|---|---|
| ① | **设计系统执行率低** | 业务代码裸 `<button>` **169 处**（ui/Button 仅 31 个文件引用）；裸 `<select>` **40 处**（ui/Select 仅 3 文件）；ui/Input 仅 5 文件。获客列表页动作按钮是裸 `<button className="bg-primary...">` | 同一按钮在 6 种页面有 6 种写法；hover/focus/disabled 行为不一致；当前最大视觉技术债 |
| ② | **加载/空态覆盖不均** | 全站 **0 个** `loading.tsx`；EmptyState 独立使用仅 **2 处**（其余靠 DataTable 默认「暂无数据」兜底）；无路由级加载骨架 | 切页白屏、慢网无感知；空态无引导动作 |
| ③ | **移动端半成品** | Sidebar 无响应式处理（`AppShell.tsx:62` 固定 flex，窄屏常驻挤压内容）；MobileNav 菜单与侧栏不一致且 `/notifications` 是**死链**；`safe-area-pb` 类**全库未定义** | 手机端基本不可用 |
| ④ | **图表色与暗色模式脱管** | 图表系列色硬编码 hex（charts 组件 + analytics 各页约 20+ 处），与 teal 主 token 不一致；globals.css **无 chart token**；ThemeProvider 无防闪烁脚本、无跟随系统选项 | 数据可视化是唯一没被 token 管辖的色域；暗色首帧闪白 |
| ⑤ | **令牌外小动作 + 重复实现** | `text-[Npx]` 21 处、`text-white` 21 处、内联 style 15 处、shadow 混用 25 处；RunStatusBadge 与 StatusBadge、`use-confirm-dialog` 两套并存；z-index 无标尺 | "每个页面差一点"的观感来源；旧计划 P2 收尾（PageHeader 变体化、盒中盒减层）未完成 |

### 1.3 交互与体验差距（五项，实测——这是比视觉更痛的一层）

| # | 断点 | 实测证据 | 影响 |
|---|---|---|---|
| ⑥ | **核心业务链路是断的** | 产品核心循环「获客 → 生成内容 → 发布 → 评论互动 → 线索 → 客户」中：潜客产出后**没有任何「生成内容」入口**（prospecting 两页 grep `/content` 零命中）；任务详情页只单向链接到客户；`/leads` 整个模块在导航中隐藏（`navigation.ts:41`）；发布结果不回链评论互动 | 用户要在模块间自己找路，产品价值链在界面上不可见，各模块实质是孤岛 |
| ⑦ | **审核队列无效率设计** | 评论审核（`conversations/review/page.tsx`）逐条操作：**无批量、无键盘快捷键**；任一 mutation pending 会**禁用所有按钮**（全局锁死）；「编辑后发送」点了没有任何编辑输入框（79-90 行，**死功能**）；「转销售处理」是无 onClick 的**死按钮**（103-105 行） | 这是运营每天高频使用的核心界面，当前设计只适合一天审几条 |
| ⑧ | **壳组件是半成品** | GlobalSearch 只过滤**侧栏菜单名的字符串**（`GlobalSearch.tsx:32-39`），搜不到任何业务实体；DataTable 仅 core row model——**无排序、无行选择、无筛选**，pagination prop 被 `void _pagination` 显式丢弃（`DataTable.tsx:58-63`，注释"will be wired in M2+"）；DataTablePagination 页大小选项存在但未接线 | ⌘K 看似可用实则空壳；列表页"看起来是专业表格"，实际不具备专业表格的任何能力 |
| ⑨ | **反馈模式割裂** | 成功反馈三种并存：`window.location.href` 整页刷新（获客创建成功 `prospecting/page.tsx:157`、通知点击 `NotificationBell.tsx:132-141`）、toast（仅 11 个文件用）、内联成功条；全站**无撤销**设计（grep 撤销/undo 零命中）；pending 锁定范围随意（审核页全页锁） | 整页刷新丢滚动位置、慢、闪；破坏性操作只有"弹窗确认"一档，重操作无保护、轻操作嫌烦 |
| ⑩ | **引导双轨失衡** | `OnboardingGuide`（三步清单：连平台→建内容→发布）挂在 `/dashboard`，而该路由被 AppShell **静默重定向到 /prospecting**（`AppShell.tsx:52-58`）——**实际不可达**；新用户真实路径只剩 ProspectingGuide 的三项前置检查 | 精心做的引导用户永远看不到；隐藏路由（cockpit/chat/research/media/leads/dashboard）的去向是悬而未决的产品债 |

---

## 2. 升级目标与原则

**目标**：把「冷静专业」从 token 层推进到**全站像素级一致（视觉轨）+ 核心流程可高效完成、核心链路在界面上可见（交互轨）**，全部落到可量化 KPI（第 6 节）。

**原则**（延续第一阶段）：

1. 不换技术栈、不换 shadcn/Radix、不新增路由层级；隐藏路由的去留是产品决策，本方案只给出建议默认值
2. **组件收编优于逐页重画**；**补完现有壳组件优于另起新交互**（DataTable/GlobalSearch 的骨架都在）
3. 所有视觉决策先落 token/组件；所有交互决策先写成规范（反馈三档、pending 纪律、破坏性操作分级），再逐页套用
4. **壳功能要么补完、要么下线，不留假功能**（死按钮、只搜菜单的搜索比没有更伤信任）
5. 每期独立 PR、可独立回滚，typecheck + build + e2e 全绿为准入

---

## 3. 轨道 A · 视觉与工艺（原第一阶段延续）

### A0 · 基线与护栏（0.5-1 人日）

- **刷新视觉基线**：`gui-test-screenshots/` 现有截图摄于 10-12（改造前）。用 Playwright 对 8-10 个代表页截取改造后基线，供各期回归对比
- **ESLint 护栏**：`no-restricted-syntax` 禁止业务代码新增裸 `<select>`、`text-white`、六位 hex；`text-[` 告警
- **chart token 落位**：globals.css 增加 `--chart-1..5`（亮/暗双套），tailwind.config.js 映射——先定义，A4 消费

### A1 · 组件收编（3-5 人日，视觉轨最大头）

- **Button 补缺口再收编**：补齐 icon-only、link、destructive-ghost、xs 尺寸；按「获客 → 内容 → 发布 → 评论/线索 → 设置」分批迁移 169 处裸 button
- **表单控件收编**：40 处裸 `<select>` → ui/select（必要时先封装 NativeSelect 过渡）；裸 input/textarea 同步
- **PageHeader 变体化**：`compact` / `default` / `withToolbar` 三形态，向后兼容
- **列表页盒中盒减层**：嵌套边框改 `divide-y`，先治理获客列表、cockpit

### A2 · 三态完备（2-3 人日）

- (dashboard) 全部路由段补 `loading.tsx` 骨架（复用 DataTableSkeleton），消灭切页白屏
- EmptyState 推广到所有列表/看板页（图标 + 一句话 + 主行动按钮）
- 错误反馈统一封装（react-query onError → toast，区分「可重试」与「需检查配置」）——**与 B1 的反馈规范合并成一个文档交付**
- 表单校验错误就地显示统一样式、必填标记、提交 pending 走 Button loading
- 沉淀 `formatDate/formatRelativeTime` 工具，替换各页裸 `toLocaleString`

### A3 · 移动端补课（2-3 人日）

- Sidebar md 以下改 off-canvas 抽屉（用现有 radix-ui 封装，不引新依赖）
- MobileNav 菜单复用 `navigation.ts` 数据源；`/notifications` 死链在 B2 落地路由后修复；globals.css 补 `safe-area-pb` 定义
- 宽表 md 以下横向滚动 + 首列 sticky；详情类页面卡片堆叠
- ThemeProvider 加防闪烁内联脚本 + 「跟随系统」选项

### A4 · 数据可视化 token 化（1-2 人日）

- 图表系列色全切 `--chart-1..5`，消灭 20+ 处硬编码 hex；`ChartContainer` 统一 recharts 主题
- 平台品牌色只允许出现在 PlatformIcon/PlatformBadge 内部
- analytics 四页逐图核对

### A5 · 工艺收尾与去重（1-2 人日）

- `text-[Npx]`/`text-white`/内联 style 归零；RunStatusBadge、useConfirmDialog 去重；z-index 标尺；shadow 收敛两档；剩余 12 处调色板色归零

### A6 · 可访问性与微交互（1-2 人日）

- icon-only 按钮补 aria-label（表格行内操作、Topbar、MobileNav）
- 过渡统一 150-200ms、`active:scale-[0.98]` 按压反馈、弹层焦点圈闭、skip-link
- ⌘K 真实生效——**由 B2 的实体搜索承接**

---

## 4. 轨道 B · 交互与体验（新增，本次方案的重点）

### B1 · 交互规范定调（1-2 人日，先行）

写一页 `docs/interaction-spec.md` 并逐页套用，内容即决策清单：

- **成功反馈三档**：轻操作 → toast；创建/编辑完成 → `router.push` + 目标页成功条；后台长任务 → 跳详情页看进度。**全站禁用 `window.location.href` 整页刷新**（改造点：获客创建 `prospecting/page.tsx:157`、通知点击 `NotificationBell.tsx:132-141` 等）
- **pending 纪律**：只锁触发按钮，禁止全页/全卡片禁用（审核页是重灾区）
- **破坏性操作分级**：可撤销轻操作（标记已读、删草稿）→ 免确认 + 撤销 toast（5s）；常规删除 → ConfirmDialog；不可逆且影响他人（解绑平台、踢成员）→ ConfirmDialog + 输入确认
- **长任务反馈**：轮询中的任务行内进度（已有）+ 完成后 toast 可点击跳转

### B2 · 壳组件补完：搜索 / 表格 / 通知（2-3 人日）

- **GlobalSearch 变成真搜索**：搜索任务/客户/线索/内容四类实体（优先复用各列表接口的过滤参数并行查询，避免等后端新接口），结果分组展示、方向键选择、Enter 跳转、空态给「未找到 + 建议入口」；⌘K 行为对齐 Linear/Notion 的 command palette 预期
- **DataTable 能力接线**：排序（getSortedRowModel）、行选择 + 批量操作栏、pagination prop 真正接线（当前被 `void _pagination` 丢弃）；先在获客/客户/线索三个核心列表落地，筛选状态写 URL 参数（可分享、可回退）
- **通知中心落地**：新建 `/notifications` 路由（列表、全部已读、按类型筛选、分页），NotificationBell 面板保留最近 N 条 + 「查看全部」；MobileNav 死链随之消除

### B3 · 审核队列效率重做（2-3 人日，运营 daily 界面）

- **批量操作**：复选框 + 底部浮动批量栏（通过 N 条 / 拒绝 N 条），复用 B2 的表格选择能力
- **键盘流**：`J/K` 上下切换、`A` 通过、`R` 拒绝、`E` 编辑、`Enter` 展开；页脚提示快捷键
- **修死功能**：「编辑后发送」补行内编辑器（textarea + 保存并发送）；「转销售处理」实现（转客户/指派动作）或移除入口——不留死按钮
- **pending 只锁当前卡片**（B1 纪律落地）+ 通过/拒绝乐观更新
- 队列状态条：剩余 N 条待审、按平台/RiskBadge 风险等级筛选

### B4 · 核心链路串联（2-4 人日，产品价值可视化）

把「获客 → 内容 → 发布 → 互动 → 线索 → 客户」在界面上接通：

- **潜客 → 内容**（当前最大断点）：潜客列表/详情加「生成内容」入口，跳 `content/new` 并预填潜客上下文（引用其评论/画像）
- **任务详情页做聚合枢纽**：prospecting/[id] 在「转客户」之外，增加关联的内容、发布任务、评论区块（用现有数据关联，不新增后端也可先做跳转型链接）
- **线索模块回归导航**：/leads 从 `hidden` 恢复暴露（**需产品拍板**，默认建议恢复；若确认废弃则删页面）
- **发布 → 互动回链**：发布任务详情/成功状态提供「查看评论」入口
- **/dashboard 去废**：要么恢复为「今日待办」聚合页（待审评论数、进行中任务、最近线索），要么确认废弃并把 OnboardingGuide 迁走（**需产品拍板**，默认建议做轻量聚合页）

### B5 · 首次体验与引导归一（1-2 人日）

- OnboardingGuide 从不可达的 /dashboard 迁至 AppShell 层（或 /prospecting 顶部），与 ProspectingGuide 三项前置检查合并为**一条引导主线**：连 LLM → 连平台账号 → 建首个获客任务 → （任务完成后）生成首篇内容
- 每步完成即打勾持久化，不重复打扰；空态引导（A2）与主线复用同一 checklist 数据
- UserGuide 单屏总览保留为「帮助 → 功能地图」手动入口

---

## 5. 实施顺序与工作量

| 期 | 内容 | 工作量 | 风险 | 备注 |
|---|---|---|---|---|
| A0 | 基线截图 + ESLint 护栏 + chart token 定义 | 0.5-1 人日 | 低 | 先行，全计划依赖 |
| B1 | 交互规范定调（反馈三档/pending/破坏性分级） | 1-2 人日 | 低 | 与 A2 错误反馈封装合并交付 |
| A1 | 组件收编（button/select/input/PageHeader/减层） | 3-5 人日 | 中（169 处分批回归） | 视觉一致性收益最大 |
| B2 | 壳组件补完（真搜索/表格排序选择分页/通知页） | 2-3 人日 | 中 | 审核批量的前置 |
| B3 | 审核队列效率重做（批量/键盘/修死按钮） | 2-3 人日 | 中 | 运营 daily 界面，收益直接 |
| A2 | 三态完备（loading/empty/error/表单/时间） | 2-3 人日 | 低 | |
| B4 | 核心链路串联（潜客→内容/聚合页/leads 暴露） | 2-4 人日 | 中 | 含 2 个产品决策点 |
| A3 | 移动端 + 暗色收尾 | 2-3 人日 | 中（AppShell 改动） | 可与 B 轨并行 |
| B5 | 首次体验引导归一 | 1-2 人日 | 低 | 依赖 B4 的 /dashboard 决策 |
| A4 | 图表 token 化 | 1-2 人日 | 低 | |
| A5 | 工艺收尾 + 去重 | 1-2 人日 | 低 | 数字归零收官 |
| A6 | 可访问性 + 微交互 | 1-2 人日 | 低 | ⌘K 由 B2 承接 |

**总计约 20-29 人日**（视觉轨 10-16 + 交互轨 8-14）。建议主线：**A0 → B1 → A1 与 B2 并行 → B3 → A2 → B4**，约 10-14 人日后视觉与交互两个最痛面同时跨档；A3-A6/B5 穿插收尾。每期独立 PR、独立回滚；A1 按「获客 → 内容 → 发布」切 3 个 PR，每合一批跑基线截图对比。

**两个产品决策点**（建议随 B4 评审一并拍板，不阻塞其他期）：① /leads 是否恢复导航暴露；② /dashboard 恢复聚合页还是正式废弃。

---

## 6. 完成度 KPI（可量化，逐期核销）

| 指标 | 现状（10-14） | 目标 |
|---|---|---|
| 业务代码裸 `<button>` | 169 | ≤ 10 |
| 裸 `<select>` | 40 | 0 |
| 路由级 loading 骨架 | 0 | (dashboard) 全覆盖 |
| EmptyState 带行动引导覆盖 | 2 处 | 所有列表/看板页 |
| 图表硬编码 hex | ~20+ | 0 |
| `text-white` / `text-[Npx]` / 内联 style | 21 / 21 / 15 | 0 / 0 / ≤ 3 |
| `window.location.href` 业务跳转 | 多处（获客创建、通知等） | 0（统一 router.push） |
| 死按钮 / 死功能 | 3 处（转销售、编辑后发送、/notifications 链接） | 0 |
| GlobalSearch 覆盖实体 | 0 类（只搜菜单名） | 4 类（任务/客户/线索/内容）+ 键盘导航 |
| DataTable 排序/行选择/分页 | 均无（pagination 被丢弃） | 3 个核心列表页全接线 |
| 审核队列批量 + 快捷键 | 均无 | 批量通过/拒绝 + J/K/A/R/E 键盘流 |
| 潜客 → 生成内容入口 | 无 | 列表 + 详情两处 |
| 核心链路跳转断点 | 3 处（潜客→内容、发布→评论、leads 隐藏） | 0 |
| 引导主线可达性 | OnboardingGuide 不可达 | 首访单主线可达且持久化 |
| 移动端（375px） | 侧栏常驻、死链 | 无溢出、导航完整可用 |
| aria-label 覆盖（icon-only 按钮） | 极低 | 100% |

## 7. 不做的事（边界）

- 不换组件库、不引新依赖（抽屉用现有 radix-ui 封装，toast 保持自研，command palette 基于 GlobalSearch 扩展而非引入 cmdk——若实现中发现自研成本高于预期，cmdk 可作为单点例外再评审）
- 不改路由层级与字段名；B4 只做「恢复暴露/聚合链接」，不做 IA 重排
- 不重画 logo/品牌命名；不做营销页式动效
- 审核队列不做 AI 自动批量通过（涉及合规边界，产品另行决策）

## 8. 风险与回归

- **169 处 button 迁移**：分批 + 每批 e2e + 截图对比；Button 向后兼容
- **AppShell 移动端改造**影响全站：单独 PR，375/768/1280 三档视口过基线页
- **B2 实体搜索**依赖现有列表接口的过滤参数：实现前先确认各接口 query 能力，不足处先做最小后端补口（列依赖清单，不默认扩后端范围）
- **B3 键盘快捷键**与输入框冲突：全局监听需判断焦点在 input/textarea 时跳过；e2e 覆盖
- **暗色模式**：每期验收含暗色截图（第一阶段曾因暗色缺失返工一次）
- 所有文案与交互改动逐页人工过，避免"AI 腔"回潮

---

## 9. 实施进度（2026-10-14 完成）

双轨全部落地，验证门禁：ESLint（含 UI 护栏）✓ / tsc ✓ / vitest web 118/118 ✓ / next build 全路由 ✓ / 本地环境浏览器截图冒烟 ✓（17 张基线图见 `gui-test-screenshots/ui-upgrade-baseline/`）。

### 交付清单

| 项 | 交付物 |
|---|---|
| A0 护栏 | ESLint `no-restricted-syntax` 四条 UI 护栏（裸 select / text-white / hex / 任意字号，`components/ui` 与 `lib/constants.ts` 豁免）；`--chart-1..5` token（亮/暗）；`safe-area-pb` 工具类；截图脚本 `scripts/capture-ui-baseline.mjs` |
| A1 组件收编 | Button 补 `ghost-destructive`/`xs`/`icon-sm`/`loading` 态；`NativeSelect` 过渡组件；PageHeader 三形态（default/dense/toolbar）；裸 button 169→22（保留均为分段切换/开关/选择卡/列表项类控件）、裸 select 40→0 |
| A2 三态 | 48 个路由级 `loading.tsx`；EmptyState 推广（通知中心/日志/审核/回复/模板等）；QueryProvider 全局 mutation onError toast 兜底；时间工具三函数（formatDate/formatDateTime/formatRelativeTime）替换全站裸拼 |
| A3 移动端+主题 | MobileSidebar off-canvas 抽屉（共用 SidebarNavContent，修复挂载即关闭 bug）；MobileNav 与 navigation.ts 同源（5 tab）；Topbar 汉堡钮；ThemeProvider 支持 system 跟随 + 首帧防闪烁内联脚本（`lib/theme-bootstrap.ts`） |
| A4 图表 | analytics 五页 + 两个图表组件全部切换 chart token；网格/tooltip 暗色主题化；平台品牌色隔离在 PlatformIcon/映射表内 |
| A5/A6 工艺 | text-white 21→0、text-[Npx] 21→0、gray 调色板 7→0；去重（useConfirmDialog 两套合并、RunStatusBadge/独立 RiskBadge/LeadLevelBadge 并入 StatusBadge + variant 覆写）；z-index 收敛标尺；icon 按钮补 aria-label；skip-link；过渡 150ms + active:scale 按压反馈 |
| B1 交互规范 | `docs/interaction-spec.md`（反馈三档/pending 纪律/破坏性三级/键盘焦点/空态导航/时间文案）；业务跳转 window.location.href 清零（保留登出/401 两个状态重置豁免）；toast 支持 action 撤销按钮 |
| B2 壳组件 | GlobalSearch → 实体搜索（任务/线索/内容/客户四类 + 页面导航，防抖 250ms、方向键选择、分组结果）；DataTable 接线排序（点击表头）/行选择（Checkbox 列，indeterminate）/服务端分页（Pagination 真正渲染）；`/notifications` 通知中心落地（筛选/全部已读/空态），NotificationBell 增加「查看全部」 |
| B3 审核队列 | 重写 review 页：批量选择 + 浮动批量栏（通过/拒绝，拒绝走 ConfirmDialog）；J/K/A/R/E 键盘流（输入态跳过，页脚键位提示）；「编辑后发送」补行内编辑器（原死功能）；移除「转销售处理」死按钮；pending 只锁当前卡片；平台筛选 + AI 建议回复展示（置信度 + RiskBadge） |
| B4 链路串联 | 获客详情「生成内容」→ content/new 预填需求上下文（source=prospecting 提示条）；工作台恢复为「今日待办」聚合页（待审回复/进行中任务/A级线索/未读通知四卡 + 快捷操作 + 引导）；/leads 恢复导航；发布详情（PUBLISHED 态）→「查看评论互动」回链 |
| B5 引导主线 | OnboardingGuide 五步主线（配置 LLM→连平台→首个获客任务→首条内容→首次发布），挂载到可达的工作台；UserGuide 单屏总览保留（修复切账不关闭问题）；e2e 用例同步更新 |
| 测试 | 修复 20 个第一阶段遗留的过时断言；新增 toast action / Button loading / asChild / 新 variant 用例；18 文件 118 用例全绿 |

### KPI 核销（方案第 6 节）

| 指标 | 基线 | 结果 |
|---|---|---|
| 业务裸 `<button>` | 169 | **22**（均为分段切换/开关/选择卡/自定义触发器等合理保留） |
| 裸 `<select>` | 40 | **0** |
| 路由级 loading 骨架 | 0 | **48** |
| text-white / text-[Npx] / 内联样式布局滥用 | 21 / 21 / 若干 | **0 / 0 / 0**（余量 style 均为 recharts/进度条等数据驱动） |
| 图表硬编码 hex | ~20 | **0** |
| `window.location.href` 业务跳转 | 多处 | **0**（登出/401 两处豁免） |
| 死按钮 / 死功能 | 3 | **0** |
| GlobalSearch 实体覆盖 | 0 | **4 类 + 页面导航 + 键盘选择** |
| DataTable 排序/选择/分页 | 无 | **已接线** |
| 审核批量 + 快捷键 | 无 | **批量通过/拒绝 + J/K/A/R/E** |
| 潜客→内容入口 | 无 | **任务详情页「生成内容」+ 上下文预填** |
| 引导可达性 | 不可达 | **五步主线挂载工作台** |
| 移动端 375px | 侧栏常驻/死链 | **抽屉 + 5 tab 底栏 + 无死链**（截图验证） |

### 遗留与说明

- 22 个保留裸 button 为分段筛选 chips、视图切换、平台 Switch 开关、角色徽章触发器、会话列表项等 toggle/选择形态控件，收编进 Button 会破坏结构——已计入豁免。
- 产品决策点已按方案默认值执行：/leads 恢复导航；/dashboard 落地为轻量「今日待办」聚合页。如需改判（如下线工作台），改动集中于 `navigation.ts` + `dashboard/page.tsx`。
- B2 实体搜索中线索/内容/获客任务三类复用列表接口前 50 条做客户端过滤（接口无 q 参数）；客户走服务端 q。后续可加后端搜索接口提升上限。
- 审核批量操作为前端并发逐条调用（后端无批量端点），量大时可加批量接口。
