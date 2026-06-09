# M1: 项目骨架 + 设计系统 + API Client + 基础设施 — 完整设计规格

> 版本: v1.0
> 日期: 2026-05-30
> 模块: M1（前端重建第一步）
> 前置依赖: 无
> 后续依赖: M2-M8 全部依赖本模块

---

## 1. 目标与范围

### 1.1 目标

建立前端项目的**全部基础设施**，确保后续 M2-M8 只需关注业务组件，不需要关心底层。

### 1.2 交付物清单

| #   | 交付物              | 说明                                                                 |
| --- | ------------------- | -------------------------------------------------------------------- |
| 1   | shadcn/ui 组件库    | 30+ 组件安装到 `src/components/ui/`                                  |
| 2   | 布局系统            | AppShell + Sidebar + Topbar + Breadcrumb + PageHeader                |
| 3   | 认证系统            | AuthProvider + Login 页面 + useAuth hook                             |
| 4   | API Client 层       | 增强 client.ts + 12 个域 API 模块 + query-keys 工厂                  |
| 5   | 共享组件库          | DataTable + StatusBadge + EmptyState + ConfirmDialog + FileUpload 等 |
| 6   | Provider 层         | QueryProvider + ThemeProvider + AuthProvider                         |
| 7   | 类型定义            | 12 个类型文件对齐 Prisma schema                                      |
| 8   | 常量/工具           | 中文标签映射 + cn() + formatDate() + formatNumber()                  |
| 9   | Vitest 单元测试     | 16 个测试用例                                                        |
| 10  | Playwright E2E 测试 | 6 个测试用例                                                         |

### 1.3 不包含

- Dashboard 业务组件（M2）
- Research/Content/Publish 等业务页面（M3-M7）
- 暗色模式（M8）
- Mock 数据基础设施（按需在 M2 开始添加）

---

## 2. 技术实现规格

### 2.1 项目初始化步骤

```bash
# 1. 备份现有关键文件（将在新代码中复用）
# 保留: lib/api/client.ts, lib/constants.ts, lib/utils.ts, types/*.ts, globals.css

# 2. 清空 apps/web/src/ 目录（保留配置文件）
# 保留: package.json, next.config.js, tailwind.config.js, tsconfig.json, postcss.config.mjs, .env.local

# 3. 初始化 shadcn/ui
npx shadcn@latest init

# 4. 批量安装 shadcn 组件
npx shadcn@latest add button input textarea select label form dialog alert-dialog sheet tabs card badge separator table dropdown-menu command popover tooltip skeleton sonner checkbox switch radio-group scroll-area avatar progress accordion alert
```

### 2.2 目录结构（完整）

```
apps/web/src/
├── app/
│   ├── layout.tsx                          # RootLayout
│   ├── globals.css                         # CSS 变量（从现有复用）
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                    # 登录页
│   └── (main)/
│       ├── layout.tsx                      # AppShell 包装
│       └── dashboard/
│           └── page.tsx                    # 占位页 → M2 替换
├── components/
│   ├── ui/                                 # shadcn/ui 组件（CLI 生成）
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── select.tsx
│   │   ├── label.tsx
│   │   ├── form.tsx                        # RHF 集成
│   │   ├── dialog.tsx
│   │   ├── alert-dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── tabs.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── separator.tsx
│   │   ├── table.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── command.tsx
│   │   ├── popover.tsx
│   │   ├── tooltip.tsx
│   │   ├── skeleton.tsx
│   │   ├── sonner.tsx
│   │   ├── checkbox.tsx
│   │   ├── switch.tsx
│   │   ├── radio-group.tsx
│   │   ├── scroll-area.tsx
│   │   ├── avatar.tsx
│   │   ├── progress.tsx
│   │   ├── accordion.tsx
│   │   └── alert.tsx
│   ├── layout/
│   │   ├── AppShell.tsx                    # 认证守卫 + 布局容器
│   │   ├── Sidebar.tsx                     # 可折叠侧栏导航
│   │   ├── Topbar.tsx                      # 顶部栏
│   │   ├── Breadcrumb.tsx                  # 面包屑
│   │   ├── PageHeader.tsx                  # 页面标题 + 操作栏
│   │   └── navigation.ts                   # 导航项定义
│   └── shared/
│       ├── DataTable.tsx                   # 通用数据表格
│       ├── DataTableToolbar.tsx            # 表格工具栏
│       ├── DataTablePagination.tsx         # 分页控件
│       ├── DataTableSkeleton.tsx           # 表格骨架屏
│       ├── StatusBadge.tsx                 # 状态徽章
│       ├── PlatformBadge.tsx               # 平台徽章
│       ├── LeadLevelBadge.tsx              # 线索等级徽章
│       ├── RiskBadge.tsx                   # 风险等级徽章
│       ├── EmptyState.tsx                  # 空状态
│       ├── ErrorState.tsx                  # 错误状态
│       ├── ConfirmDialog.tsx               # 确认弹窗
│       ├── FileUpload.tsx                  # 文件上传
│       ├── GlobalSearch.tsx                # 全局搜索 ⌘K
│       ├── NotificationBell.tsx            # 通知铃铛
│       └── UserMenu.tsx                    # 用户菜单
├── hooks/
│   ├── use-app-store.ts                    # Zustand: sidebar + theme
│   ├── use-auth.ts                         # Auth context consumer
│   ├── use-confirm-dialog.ts               # 命令式确认弹窗
│   └── use-toast-action.ts                 # Mutation toast 工具
├── lib/
│   ├── api/
│   │   ├── client.ts                       # API 客户端（从现有复用+增强）
│   │   ├── auth.ts                         # 认证 API
│   │   ├── dashboard.ts                    # Dashboard API
│   │   ├── research.ts                     # 调研 API
│   │   ├── content.ts                      # 内容 API
│   │   ├── media.ts                        # 素材 API
│   │   ├── publish.ts                      # 发布 API
│   │   ├── conversations.ts                # 会话 API
│   │   ├── leads.ts                        # 线索 API
│   │   ├── analytics.ts                    # 分析 API
│   │   ├── integrations.ts                 # 集成 API
│   │   └── settings.ts                     # 设置 API
│   ├── query-keys.ts                       # TanStack Query key 工厂
│   ├── constants.ts                        # 从现有复用
│   └── utils.ts                            # 从现有复用
├── providers/
│   ├── QueryProvider.tsx                    # TanStack Query provider
│   ├── AuthProvider.tsx                     # 认证 context
│   └── ThemeProvider.tsx                    # 主题 provider（为 M8 暗色模式预留）
├── types/
│   ├── api.ts                              # 从现有复用
│   ├── enums.ts                            # 从现有复用
│   ├── platform.ts                         # 从现有复用
│   ├── dashboard.ts                        # 从现有复用
│   ├── research.ts                         # 从现有复用
│   ├── content.ts                          # 从现有复用
│   ├── media.ts                            # 从现有复用
│   ├── publish.ts                          # 从现有复用
│   ├── interaction.ts                      # 从现有复用
│   ├── lead.ts                             # 从现有复用
│   ├── analytics.ts                        # 从现有复用
│   └── settings.ts                         # 从现有复用
└── features/                               # 空目录结构，M2 开始填充
    ├── dashboard/
    ├── research/
    ├── content/
    ├── media/
    ├── publish/
    ├── conversations/
    ├── leads/
    ├── analytics/
    ├── integrations/
    └── settings/
```

---

## 3. 组件规格

### 3.1 布局组件

#### 3.1.1 AppShell

```tsx
// components/layout/AppShell.tsx
// 用途: 认证路由组的布局容器
// 位置: app/(main)/layout.tsx 中使用

interface AppShellProps {
  children: React.ReactNode;
}

// 行为:
// 1. 检查 AuthProvider 的 isAuthenticated
// 2. 未认证 → redirect('/login')
// 3. 已认证 → 渲染 Sidebar + main area
// 4. main area 包含 Topbar + Breadcrumb + {children}
// 5. Sidebar 可折叠（受 useAppStore.sidebarCollapsed 控制）

// 渲染结构:
// <div className="flex h-screen">
//   <Sidebar />
//   <div className="flex flex-1 flex-col overflow-hidden">
//     <Topbar />
//     <main className="flex-1 overflow-y-auto p-6">
//       <Breadcrumb />
//       {children}
//     </main>
//   </div>
// </div>
```

#### 3.1.2 Sidebar

```tsx
// components/layout/Sidebar.tsx
// 用途: 左侧导航栏

// Props: 无（内部使用 useAppStore 和 usePathname）
// 状态: collapsed (Zustand store 持久化到 localStorage)
// 导航项: 从 navigation.ts 导入 navItems

// 行为:
// 1. 展开(240px) / 折叠(64px) 切换
// 2. 当前路由高亮（pathname.startsWith(item.href)）
// 3. hidden=true 的项不渲染（research/media 在 M3/M4 启用时改为 false）
// 4. 折叠时只显示图标 + tooltip
// 5. 展开时显示图标 + 中文标签
// 6. 底部: 折叠切换按钮

// 使用 shadcn/ui:
// - Tooltip 用于折叠状态的 tooltip
// - Button 用于折叠切换
// - 使用 <Link> 组件进行导航
// - 使用 cn() 进行条件样式

// 导航项定义（从现有 navigation.ts 复用）:
// 工作台 /dashboard, 内容运营 /content, 发布运营 /publish,
// 评论私信 /conversations, 线索管理 /leads, 数据复盘 /analytics,
// 集成配置 /integrations, 系统设置 /settings
// hidden: 市场调研 /research, 素材库 /media
```

#### 3.1.3 Topbar

```tsx
// components/layout/Topbar.tsx
// 用途: 顶部栏

// 渲染:
// 左侧: 环境标识 badge（Mock/Local/Production）
// 右侧: GlobalSearch(⌘K) + NotificationBell + UserMenu
// 高度: h-14

// 环境标识:
// - 读取 process.env.NEXT_PUBLIC_API_MOCKING === 'true' → "Mock 模式"
// - 否则 → "生产环境"（可通过 NEXT_PUBLIC_ENV_NAME 自定义）

// UserMenu 下拉:
// - 显示当前用户 email + 角色
// - 菜单项: 个人设置 / 退出登录
// - 退出: authToken.clear() → redirect('/login')
```

#### 3.1.4 Breadcrumb

```tsx
// components/layout/Breadcrumb.tsx
// 用途: 自动面包屑导航

// 行为:
// 1. 从 usePathname() 解析路径段
// 2. 第一段映射为中文: dashboard→工作台, research→市场调研, ...
// 3. 动态段 ([id]) 显示为截断 ID
// 4. 最后一段不可点击
// 5. 使用 shadcn/ui Separator 分隔

// 映射表:
const breadcrumbLabels: Record<string, string> = {
  dashboard: '工作台',
  research: '市场调研',
  content: '内容运营',
  media: '素材库',
  publish: '发布运营',
  conversations: '评论私信',
  leads: '线索管理',
  analytics: '数据复盘',
  integrations: '集成配置',
  settings: '系统设置',
  // 二级
  new: '新建',
  tasks: '任务',
  insights: '洞察',
  opportunities: '选题机会',
  queue: '队列',
  manual: '手动发布',
  pipeline: '看板',
  review: '审核',
  platforms: '平台账号',
  ai: 'AI 配置',
  skills: '技能',
  compliance: '合规'
};
```

#### 3.1.5 PageHeader

```tsx
// components/layout/PageHeader.tsx
// 用途: 页面标题 + 描述 + 操作按钮区域

interface PageHeaderProps {
  title: string; // 页面标题
  description?: string; // 可选描述
  actions?: React.ReactNode; // 右侧操作区（按钮等）
}

// 渲染:
// <div className="flex items-center justify-between">
//   <div>
//     <h1 className="text-2xl font-bold">{title}</h1>
//     {description && <p className="text-muted-foreground">{description}</p>}
//   </div>
//   {actions && <div className="flex items-center gap-2">{actions}</div>}
// </div>
```

---

### 3.2 认证系统

#### 3.2.1 AuthProvider

```tsx
// providers/AuthProvider.tsx

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'sales' | 'viewer';
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean; // 首次加载时 true
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// 行为:
// 1. mount 时检查 localStorage 有无 token
// 2. 有 token → 调用 GET /api/auth/me 获取用户信息
// 3. token 无效/过期 → clear + user=null
// 4. login: POST /api/auth/login → 存储 token → 设置 user
// 5. logout: clear token + user=null → redirect('/login')
// 6. JWT 过期检测: 解码 payload.exp，提前 5 分钟自动 logout
```

#### 3.2.2 Login 页面

```tsx
// app/(auth)/login/page.tsx

// 使用 React Hook Form + Zod:
const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少 8 个字符')
});

// 行为:
// 1. 居中卡片布局（Card 组件）
// 2. Logo + "AI Growth Ops" 标题
// 3. Email 输入框 + Password 输入框
// 4. 提交按钮（加载时 disabled + spinner）
// 5. 成功 → redirect('/dashboard')
// 6. 失败 → form.setError('root', { message }) 显示在表单顶部
// 7. 已登录用户访问 /login → redirect('/dashboard')

// UI 规格:
// - 卡片: max-w-md mx-auto, mt-[20vh]
// - 输入框: shadcn Input + Label
// - 按钮: shadcn Button, fullWidth, variant="default"
// - 错误: shadcn Alert variant="destructive"
```

---

### 3.3 共享组件

#### 3.3.1 DataTable

```tsx
// components/shared/DataTable.tsx
// 用途: 通用数据表格，基于 TanStack Table + shadcn Table

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string; // 默认 "暂无数据"
  emptyDescription?: string;
  emptyAction?: { label: string; href: string };
  searchable?: boolean; // 是否显示搜索框
  searchPlaceholder?: string;
  toolbar?: React.ReactNode; // 额外工具栏内容（筛选器等）
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
}

// 状态处理:
// isLoading=true  → 渲染 <DataTableSkeleton columns={columns.length} rows={5} />
// error!=null     → 渲染 <ErrorState error={error} />
// data.length===0 → 渲染 <EmptyState />
// 正常            → 渲染 shadcn Table + DataTablePagination

// 使用方式（M2-M7 各业务页面的标准模式）:
// <DataTable
//   columns={columns}
//   data={data}
//   isLoading={isLoading}
//   error={error}
//   searchable
//   toolbar={<StatusFilter />}
//   pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
// />
```

#### 3.3.2 StatusBadge

```tsx
// components/shared/StatusBadge.tsx

interface StatusBadgeProps {
  status: string; // 任意状态字符串
  labels?: Record<string, string>; // 可选自定义标签映射
  size?: 'sm' | 'default'; // 默认 default
}

// 行为:
// 1. 从 constants.ts 的 statusVariantMap 获取 variant
// 2. 从传入的 labels 或 constants.ts 获取中文标签
// 3. 映射到 shadcn Badge variant:
//    success → bg-emerald-100 text-emerald-700
//    warning → bg-amber-100 text-amber-700
//    danger  → bg-red-100 text-red-700
//    muted   → bg-gray-100 text-gray-500
//    info    → bg-blue-100 text-blue-700
```

#### 3.3.3 PlatformBadge

```tsx
// components/shared/PlatformBadge.tsx

interface PlatformBadgeProps {
  platform: Platform;
  showIcon?: boolean; // 是否显示 emoji 图标，默认 true
}

// 从 constants.ts 的 platformLabels + platformIcons 获取显示文本
```

#### 3.3.4 LeadLevelBadge

```tsx
// components/shared/LeadLevelBadge.tsx

interface LeadLevelBadgeProps {
  level: LeadLevel; // 'A' | 'B' | 'C' | 'D'
}

// 颜色映射:
// A → 红色背景 (bg-red-100 text-red-700) 高意向突出
// B → 橙色背景 (bg-amber-100 text-amber-700)
// C → 蓝色背景 (bg-blue-100 text-blue-700)
// D → 灰色背景 (bg-gray-100 text-gray-500)
```

#### 3.3.5 RiskBadge

```tsx
// components/shared/RiskBadge.tsx

interface RiskBadgeProps {
  risk: RiskLevel; // 'low' | 'medium' | 'high'
}

// 从 riskLevelLabels 获取标签
// low → 绿色, medium → 橙色, high → 红色
```

#### 3.3.6 EmptyState

```tsx
// components/shared/EmptyState.tsx

interface EmptyStateProps {
  title?: string; // 默认 "暂无数据"
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  icon?: React.ReactNode; // 可选图标
}

// 渲染: 居中卡片，图标 + 标题 + 描述 + 操作按钮
```

#### 3.3.7 ErrorState

```tsx
// components/shared/ErrorState.tsx

interface ErrorStateProps {
  error: Error | string;
  onRetry?: () => void;
}

// 渲染: shadcn Alert variant="destructive" + 重试按钮
```

#### 3.3.8 ConfirmDialog

```tsx
// components/shared/ConfirmDialog.tsx
// 用途: 命令式危险操作确认

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string; // 默认 "确认"
  cancelLabel?: string; // 默认 "取消"
  variant?: 'default' | 'destructive'; // 默认 default
}

// 命令式 hook 用法:
// const confirm = useConfirmDialog();
// const confirmed = await confirm({ title: '删除确认', description: '...', variant: 'destructive' });
// if (confirmed) { ... }

// 基于 shadcn AlertDialog
```

#### 3.3.9 FileUpload

```tsx
// components/shared/FileUpload.tsx

interface FileUploadProps {
  accept?: string; // 默认 "image/*,video/*"
  multiple?: boolean; // 默认 true
  maxSize?: number; // 单文件最大字节，默认 100MB
  onFiles: (files: File[]) => void;
  uploading?: boolean;
  progress?: number; // 0-100
}

// 行为:
// 1. 拖拽区域 + 点击选择文件
// 2. 文件类型校验（根据 accept）
// 3. 文件大小校验
// 4. 预览已选文件（图片显示缩略图）
// 5. 上传中显示 Progress bar
// 6. 错误时 toast 提示
```

#### 3.3.10 GlobalSearch

```tsx
// components/shared/GlobalSearch.tsx
// 用途: ⌘K 全局搜索命令面板

// 行为:
// 1. Topbar 中显示搜索按钮
// 2. ⌘K / Ctrl+K 打开 Command Dialog
// 3. 快捷跳转: 输入"内容" → /content, "线索" → /leads, ...
// 4. 后续可扩展搜索实际数据（M8）

// 快捷跳转映射:
const searchCommands = [
  { label: '工作台', href: '/dashboard', icon: LayoutDashboard },
  { label: '内容运营', href: '/content', icon: FileText },
  { label: '发布运营', href: '/publish/queue', icon: Send },
  { label: '评论私信', href: '/conversations', icon: MessageSquare },
  { label: '线索看板', href: '/leads/pipeline', icon: UserCheck },
  { label: '新建内容', href: '/content/new', icon: Plus },
  { label: '新建调研', href: '/research/new', icon: Search },
  { label: '数据复盘', href: '/analytics', icon: BarChart3 }
];
```

---

### 3.4 API Client 层

#### 3.4.1 client.ts（增强版）

```tsx
// lib/api/client.ts
// 从现有复用 + 增加:

// 新增: requestId header
function buildHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': crypto.randomUUID(),
    ...extra
  };
  // ...原有 token 逻辑不变
}

// 新增: apiGet 支持 signal（用于 abort）
export async function apiGet<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: buildHeaders(), ...opts });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw await parseError(res);
  return res.json();
}

// 新增: 分页请求封装
export async function apiGetPage<T>(
  path: string,
  params: PageParams
): Promise<PageResult<T>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  // 其他参数
  Object.entries(params).forEach(([k, v]) => {
    if (k !== 'page' && k !== 'pageSize' && v !== undefined)
      qs.set(k, String(v));
  });
  const result = await apiGet<ApiResponse<PageResult<T>>>(
    `${path}?${qs.toString()}`
  );
  return result.data;
}
```

#### 3.4.2 query-keys.ts

```tsx
// lib/query-keys.ts
// TanStack Query key 工厂，确保 key 一致性

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const
  },
  dashboard: {
    all: ['dashboard'] as const
  },
  research: {
    tasks: ['research', 'tasks'] as const,
    task: (id: string) => ['research', 'task', id] as const,
    posts: (taskId: string) => ['research', 'task', taskId, 'posts'] as const,
    comments: (taskId: string) =>
      ['research', 'task', taskId, 'comments'] as const,
    insights: ['research', 'insights'] as const,
    opportunities: ['research', 'opportunities'] as const
  },
  content: {
    items: ['content', 'items'] as const,
    item: (id: string) => ['content', 'item', id] as const,
    variants: (itemId: string) =>
      ['content', 'item', itemId, 'variants'] as const
  },
  media: {
    assets: ['media', 'assets'] as const
  },
  publish: {
    jobs: ['publish', 'jobs'] as const,
    job: (id: string) => ['publish', 'job', id] as const,
    attempts: (jobId: string) => ['publish', 'job', jobId, 'attempts'] as const
  },
  interactions: {
    all: ['interactions'] as const,
    conversation: (id: string) => ['conversations', id] as const
  },
  leads: {
    all: ['leads'] as const,
    lead: (id: string) => ['leads', id] as const,
    activities: (leadId: string) => ['leads', leadId, 'activities'] as const
  },
  analytics: {
    overview: ['analytics', 'overview'] as const,
    platforms: ['analytics', 'platforms'] as const,
    contentRoi: ['analytics', 'content-roi'] as const,
    leadTrend: ['analytics', 'lead-trend'] as const,
    platformTrend: ['analytics', 'platform-trend'] as const
  },
  integrations: {
    accounts: ['integrations', 'accounts'] as const,
    providers: ['integrations', 'providers'] as const,
    feishu: ['integrations', 'feishu'] as const,
    wecom: ['integrations', 'wecom'] as const
  },
  settings: {
    ai: ['settings', 'ai'] as const,
    skills: ['settings', 'skills'] as const,
    compliance: ['settings', 'compliance'] as const
  },
  notifications: {
    all: ['notifications'] as const
  },
  audit: {
    logs: ['audit', 'logs'] as const
  }
} as const;
```

#### 3.4.3 域 API 模块示例（auth.ts）

```tsx
// lib/api/auth.ts
import { apiGet, apiPost } from './client';
import type { ApiResponse } from '@/types/api';

interface LoginRequest {
  email: string;
  password: string;
}
interface LoginResponse {
  token: string;
  user: { id: string; email: string; name: string; role: string };
}
interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function login(data: LoginRequest) {
  const res = await apiPost<ApiResponse<LoginResponse>>(
    '/api/auth/login',
    data
  );
  return res.data;
}

export async function getMe() {
  const res = await apiGet<ApiResponse<MeResponse>>('/api/auth/me');
  return res.data;
}
```

其余 10 个域模块（dashboard, research, content, media, publish, conversations, leads, analytics, integrations, settings）按相同模式组织，每个模块封装该域的所有 API 调用。M1 阶段先建立文件骨架和类型签名，具体实现在对应 M 模块中完善。

---

### 3.5 Provider 层

#### 3.5.1 QueryProvider

```tsx
// providers/QueryProvider.tsx
// 从现有复用，配置不变:
// - staleTime: 60_000 (60s)
// - retry: 1
// - refetchOnWindowFocus: false
```

#### 3.5.2 AuthProvider

```tsx
// providers/AuthProvider.tsx
// 见 3.2.1 AuthProvider 规格
// Context + Provider 模式
// mount 时检查 token → getMe → 设置 user
```

#### 3.5.3 ThemeProvider

```tsx
// providers/ThemeProvider.tsx
// M1 只做最小实现:
// - 读取 localStorage 的 theme 偏好
// - 给 <html> 添加/移除 "dark" class
// - M8 扩展为完整的暗色模式

interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}
```

---

### 3.6 Hooks

#### 3.6.1 useAppStore

```tsx
// hooks/use-app-store.ts
import { create } from 'zustand';

interface AppStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  notificationPanelOpen: boolean;
  setNotificationPanelOpen: (open: boolean) => void;
}

// 持久化 sidebar + theme 到 localStorage
```

#### 3.6.2 useAuth

```tsx
// hooks/use-auth.ts
// 简单 re-export:
// export const useAuth = () => useContext(AuthContext);
// 如果在 Provider 外使用 → throw Error
```

#### 3.6.3 useConfirmDialog

```tsx
// hooks/use-confirm-dialog.ts
// 命令式 confirm hook

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

function useConfirmDialog(): ConfirmFunction {
  // 1. 渲染一个 ConfirmDialog 组件到 body
  // 2. 调用时返回 Promise<boolean>
  // 3. 用户点确认 → resolve(true)
  // 4. 用户点取消 → resolve(false)
}
```

#### 3.6.4 useToastAction

```tsx
// hooks/use-toast-action.ts
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

// 包装 mutation，自动 toast 成功/失败:
function useToastAction<TData, TVariables>(
  mutationFn: (vars: TVariables) => Promise<TData>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
  }
) {
  return useMutation({
    mutationFn,
    onSuccess: () => toast.success(options?.successMessage ?? '操作成功'),
    onError: (err) =>
      toast.error(options?.errorMessage ?? `操作失败: ${err.message}`)
  });
}
```

---

## 4. 关键交互流程

### 4.1 登录流程

```
用户访问任意页面
  → AppShell 检查 AuthProvider.isAuthenticated
  → false → redirect('/login')
  → Login 页面
    → 用户输入 email + password
    → React Hook Form Zod 校验
      → 校验失败 → 字段下方红色错误提示
      → 校验成功 → POST /api/auth/login
        → 成功 → authToken.set(token) → AuthProvider 设置 user → redirect('/dashboard')
        → 失败 → form.setError('root', { message: '邮箱或密码错误' })
```

### 4.2 导航流程

```
用户点击 Sidebar 项
  → <Link href={item.href}> 导航
  → Next.js App Router 处理路由
  → Breadcrumb 根据 pathname 自动更新
  → Sidebar 高亮更新（usePathname()）
  → 折叠时 tooltip 显示标签
```

### 4.3 全局搜索流程

```
用户按 ⌘K / Ctrl+K
  → Command Dialog 打开
  → 显示快捷跳转列表
  → 用户输入搜索词
  → 实时过滤匹配项
  → 选择 → 关闭 Dialog → 导航到目标页面
```

---

## 5. 状态管理矩阵

| 数据         | 存储位置               | 原因                          |
| ------------ | ---------------------- | ----------------------------- |
| JWT Token    | localStorage           | 跨 tab 持久化                 |
| 当前用户     | AuthProvider context   | 全局共享，mount 时从 API 获取 |
| Sidebar 折叠 | Zustand + localStorage | UI 偏好                       |
| 主题         | Zustand + localStorage | UI 偏好                       |
| 面包屑       | URL pathname           | 派生状态，无独立存储          |
| 搜索面板开关 | Component state        | 临时 UI 状态                  |

---

## 6. 测试用例规格

### 6.1 Vitest 单元测试（16 个）

#### 文件: `tests/unit/m1/button.test.tsx`

```typescript
// TC-M1-001: Button 各 variant 渲染正确 class
// 输入: <Button variant="destructive">删除</Button>
// 期望: 渲染的 button 元素包含 "bg-destructive" class
// 同时测试: variant="default", "outline", "secondary", "ghost", "link"
```

#### 文件: `tests/unit/m1/input.test.tsx`

```typescript
// TC-M1-002: Input 带 error 样式渲染
// 输入: <Input className="border-destructive" />
// 期望: input 元素包含 "border-destructive" class
```

#### 文件: `tests/unit/m1/dialog.test.tsx`

```typescript
// TC-M1-003: Dialog 打开/关闭、焦点管理
// 输入: 设置 open={true}
// 期望: Dialog 内容出现在 DOM 中
// 输入: 设置 open={false}
// 期望: Dialog 内容从 DOM 中移除
```

#### 文件: `tests/unit/m1/status-badge.test.tsx`

```typescript
// TC-M1-004: StatusBadge 映射状态字符串到正确 variant
// 测试用例:
//   status="PUBLISHED" → variant="success" → 绿色样式
//   status="FAILED"    → variant="danger"  → 红色样式
//   status="DRAFT"     → variant="muted"   → 灰色样式
//   status="RUNNING"   → variant="warning" → 橙色样式
```

#### 文件: `tests/unit/m1/platform-badge.test.tsx`

```typescript
// TC-M1-005: PlatformBadge 6 个平台中文标签
// 测试: 遍历 6 个平台，验证渲染文本匹配 platformLabels
```

#### 文件: `tests/unit/m1/data-table.test.tsx`

```typescript
// TC-M1-006: DataTable 表头+数据行渲染，空数据显示 EmptyState
// 测试1: 传入 columns + data(3行) → 渲染 3 行
// 测试2: 传入 data=[] → 渲染 EmptyState（含 "暂无数据"）
```

#### 文件: `tests/unit/m1/data-table-skeleton.test.tsx`

```typescript
// TC-M1-007: DataTable skeleton loading 态
// 输入: isLoading={true}
// 期望: 渲染 Skeleton 组件，不渲染 table
```

#### 文件: `tests/unit/m1/data-table-pagination.test.tsx`

```typescript
// TC-M1-008: DataTablePagination 分页计算
// 输入: total=47, pageSize=10, page=1
// 期望: 显示 "第 1-10 条，共 47 条"
// 输入: page=5
// 期望: 显示 "第 41-47 条，共 47 条"
```

#### 文件: `tests/unit/m1/confirm-dialog.test.tsx`

```typescript
// TC-M1-009: ConfirmDialog 渲染标题描述，触发 onConfirm
// 测试: 渲染 ConfirmDialog，点击确认按钮 → onConfirm 被调用
// 测试: 点击取消 → onCancel 被调用
```

#### 文件: `tests/unit/m1/file-upload.test.tsx`

```typescript
// TC-M1-010: FileUpload 拖拽上传
// 测试1: drop 事件触发 onFiles 回调
// 测试2: accept="image/*" 时，.txt 文件不触发 onFiles
// 测试3: maxSize 限制时，超大文件显示错误
```

#### 文件: `tests/unit/m1/use-app-store.test.ts`

```typescript
// TC-M1-011: useAppStore toggle sidebar
// 测试: 初始 sidebarCollapsed=false → toggleSidebar() → sidebarCollapsed=true
```

#### 文件: `tests/unit/m1/api-client.test.ts`

```typescript
// TC-M1-012: apiGet 附带 Authorization header
// mock localStorage token → 调用 apiGet → 验证 fetch header 包含 Bearer

// TC-M1-013: apiGet 4xx 抛出 ApiError
// mock fetch 返回 404 → 验证抛出 ApiError status=404

// TC-M1-014: apiPost 401 清除 token 跳转
// mock fetch 返回 401 → 验证 localStorage.removeItem 被调用
//                     → 验证 window.location.href = '/login'
```

#### 文件: `tests/unit/m1/schemas.test.ts`

```typescript
// TC-M1-015: Zod schema 校验
// loginSchema:
//   { email: 'test@test.com', password: '12345678' } → pass
//   { email: 'invalid', password: '12345678' }       → fail (email)
//   { email: 'test@test.com', password: '123' }       → fail (password min 8)
```

#### 文件: `tests/unit/m1/query-keys.test.ts`

```typescript
// TC-M1-016: queryKeys 生成一致的 key 字符串
// queryKeys.research.tasks → ['research', 'tasks']
// queryKeys.content.item('abc') → ['content', 'item', 'abc']
```

### 6.2 Playwright E2E 测试（6 个）

#### 文件: `tests/e2e/m1-login.test.ts`

```typescript
// TC-E2E-M1-001: 有效凭据登录 → 跳转 dashboard
// 前置: 数据库有 admin@ai-growth-ops.local 用户
// 步骤:
//   1. 访问 /login
//   2. 填写 email: admin@ai-growth-ops.local
//   3. 填写 password: changeme123
//   4. 点击提交按钮
//   5. 等待导航完成
// 验证: URL 为 /dashboard
// 验证: localStorage 有 auth_token

// TC-E2E-M1-002: 无效凭据登录 → 显示错误
// 步骤:
//   1. 访问 /login
//   2. 填写错误密码
//   3. 点击提交
// 验证: 页面显示错误信息
// 验证: URL 仍为 /login

// TC-E2E-M1-003: 未认证访问 → 重定向 login
// 步骤:
//   1. 清除 localStorage
//   2. 访问 /dashboard
// 验证: URL 被重定向到 /login
```

#### 文件: `tests/e2e/m1-navigation.test.ts`

```typescript
// TC-E2E-M1-004: Sidebar 折叠/展开
// 前置: 已登录
// 步骤:
//   1. 点击折叠按钮
// 验证: Sidebar 宽度变为 64px
// 验证: 导航标签不可见
//   2. 再次点击
// 验证: Sidebar 宽度恢复 240px
// 验证: 导航标签可见

// TC-E2E-M1-005: Sidebar 导航高亮当前路由
// 前置: 已登录
// 步骤:
//   1. 点击 "内容运营" 导航项
// 验证: URL 为 /content
// 验证: "内容运营" 项高亮（bg-accent class）
// 验证: 其他项不高亮

// TC-E2E-M1-006: Breadcrumb 正确渲染路径
// 前置: 已登录
// 步骤:
//   1. 访问 /leads/pipeline
// 验证: Breadcrumb 显示 "线索管理 / 看板"
```

---

## 7. 实现顺序

```
Step 1: 清空 src/ 目录（保留配置文件和 globals.css）
Step 2: npx shadcn@latest init → 配置 components.json
Step 3: 批量安装 shadcn/ui 组件（30+）
Step 4: 复用迁移: client.ts, constants.ts, utils.ts, types/*.ts, globals.css
Step 5: 创建 providers/ (QueryProvider, AuthProvider, ThemeProvider)
Step 6: 创建 hooks/ (use-app-store, use-auth, use-confirm-dialog, use-toast-action)
Step 7: 创建 lib/ (query-keys.ts, api/auth.ts 骨架, 其余域模块骨架)
Step 8: 创建 components/layout/ (AppShell, Sidebar, Topbar, Breadcrumb, PageHeader, navigation)
Step 9: 创建 components/shared/ (DataTable 系列, Badge 系列, EmptyState, ErrorState, ConfirmDialog, FileUpload, GlobalSearch, NotificationBell, UserMenu)
Step 10: 创建 app/ 路由 (layout.tsx, (auth)/login, (main)/layout, (main)/dashboard 占位)
Step 11: 编写单元测试（16 个）
Step 12: 编写 E2E 测试（6 个）
Step 13: pnpm typecheck + pnpm lint + 全部测试通过
```

---

## 8. 验证标准

| #   | 验证项          | 通过标准                               |
| --- | --------------- | -------------------------------------- |
| 1   | TypeScript 编译 | `pnpm typecheck` 零错误                |
| 2   | ESLint          | `pnpm lint` 零错误                     |
| 3   | 单元测试        | 16/16 通过                             |
| 4   | E2E 测试        | 6/6 通过                               |
| 5   | 登录流程        | 手动验证 email/password → dashboard    |
| 6   | Sidebar 折叠    | 手动验证折叠/展开 + 导航高亮           |
| 7   | 全局搜索        | ⌘K 打开 → 搜索"线索" → 跳转 /leads     |
| 8   | 面包屑          | 多级路由显示正确路径                   |
| 9   | shadcn 组件     | Button/Input/Dialog/Badge 渲染正确样式 |
| 10  | 响应式          | 窗口缩小时 Sidebar 自动折叠            |

---

## 9. 风险项

| 风险                                  | 缓解措施                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| shadcn init 覆盖 globals.css          | 先备份，init 后 diff merge；现有 CSS 变量已符合 shadcn 规范，兼容性高 |
| shadcn 某些组件需要额外 peer deps     | init 时自动安装，检查 package.json 变化                               |
| Vitest 配置与 Next.js App Router 冲突 | 使用 `@vitejs/plugin-react` + `jsdom` 环境，paths alias 对齐 tsconfig |
| Playwright 测试需要后端运行           | 测试中使用 MSW mock API 或要求 `docker compose up` 前置               |
