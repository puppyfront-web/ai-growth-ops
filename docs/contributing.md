# 贡献指南

## 开发环境设置

```bash
# 安装依赖
pnpm install

# 启动基础设施
docker compose up -d postgres redis minio

# 初始化数据库
pnpm --filter @ai-growth-ops/database db-push

# 构建共享包
pnpm -r build

# 启动开发服务
pnpm --filter @ai-growth-ops/api dev
pnpm --filter @ai-growth-ops/web dev
```

## 代码规范

- TypeScript strict mode
- ESLint 配置
- 单文件组件原则
- 中文 UI 文案

## 提交流程

1. 从 `main` 创建功能分支: `feat/xxx` / `fix/xxx`
2. 开发 + 测试
3. 确保 typecheck 通过: `pnpm -r typecheck`
4. 确保测试通过: `pnpm vitest run`
5. 提交 PR 到 `main`
6. CI 检查通过后合并

## 项目结构约定

### API 路由

```typescript
// apps/api/src/routes.ts
{
  method: 'POST',
  pattern: '/api/resource',
  handler: async (req, res, ctx) => {
    const orgCtx = await getOrganizationContext(req, ctx.db);
    if (!orgCtx) return sendJson(res, 401, { error: '未登录' });
    // ... RBAC check if needed
    // ... Zod validation
    // ... business logic
    sendJson(res, 200, result);
  }
}
```

### 前端页面

```tsx
// apps/web/src/app/(dashboard)/resource/page.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';

export default function ResourcePage() {
  const { data, isLoading, error, refetch } = useQuery({...});
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  return <div>...</div>;
}
```

### 共享包

每个包独立构建 (tsup):

```bash
packages/database/  — Prisma schema + client
packages/shared/    — 工具函数
packages/email/     — 邮件模板和发送
```

## 测试

```bash
# 运行所有测试
pnpm vitest run

# 运行特定测试
pnpm vitest run tests/unit/rbac.test.ts

# 监视模式
pnpm vitest
```
