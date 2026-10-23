# 参与贡献

感谢关注 AI Growth Ops！本项目面向单公司/单品牌自用的多平台获客运营场景，欢迎通过 Issue 与 Pull Request 参与共建。

## 开发环境

```bash
git clone https://github.com/puppyfront-web/ai-growth-ops.git ai-growth-ops && cd ai-growth-ops
pnpm install
cp .env.example .env        # 填入 OPENAI_API_KEY（AI 能力需要）
./scripts/dev.sh            # 启动 docker 基础设施 + 迁移 + 4 个服务
```

要求：Node.js v20+（推荐 v24）、pnpm 10+、Docker Desktop。默认登录 `admin@ai-growth-ops.local` / `changeme123`（本地开发环境，首登后请改密码）。

## 开发工作流（SDD + TDD）

任何非平凡改动按以下顺序执行，不得跳阶（完整约定见 [`AGENTS.md`](./AGENTS.md)，它优先于本文件）：

1. **Spec**：在 `spec/` 新增编号文档，写清背景、目标、非目标、数据模型、API、UI、验收标准、测试矩阵。
2. **Plan**：在 `spec/` 写任务计划，按"先测试、后实现"拆分。
3. **Red**：先写失败测试。纯逻辑放 `packages/shared`；数据库行为放 `tests/integration`；路由行为放 `tests/integration/api`；页面行为放 `tests/web/unit`。
4. **Green**：最小实现让测试通过。
5. **Refactor**：消除重复、保持现有风格。
6. **Verify**：受影响测试 + `pnpm typecheck` + `pnpm lint`；涉及迁移时运行迁移链检查。
7. **Report**：PR 描述写明改动、测试证据、未完成项与风险。

纯文档、纯样式调整可豁免测试，但需说明验证方式。

## 提交前检查

```bash
pnpm lint
pnpm typecheck
pnpm test            # 单元 + 集成 + Web
pnpm test:architecture
```

单文件测试优先：

```bash
pnpm vitest run tests/unit/shared/xxx.test.ts
pnpm test:web -- tests/web/unit/xxx.test.tsx
pnpm test:integration -- tests/integration/xxx.test.ts
```

注意：集成测试通过 `scripts/with-e2e-database.mjs` 使用一次性 e2e 数据库（`ai_growth_ops_e2e`），**严禁**直接对开发/业务库运行集成测试（会触发 `resetDatabase` 清库）。

## 代码约定要点

- 架构守卫：`packages/runtime` 禁止 import `apps/*`；新业务复用现有领域服务与 Prisma 事务，不引入新编排框架。
- 跨模块纯逻辑放 `packages/shared`，不要在 Web/API/Worker 各写一份。
- 不新增 `any`、`@ts-ignore`、ESLint 禁用注释；确需例外时写明原因并加测试。
- 新表必须有 `organizationId` 与必要索引；所有查询带组织过滤；软删除用 `deletedAt`；金额用 `Decimal` 或整数分。
- 迁移只做增量，可重放；迁移后运行 `pnpm db:generate`。
- API 入参必须 Zod 校验；列表统一 `parsePagination`；异步动作返回 `202`。
- Web 数据请求集中在 `apps/web/src/lib/api/*` + React Query；空态/错误态/pending 态齐全；不做没接后端的按钮。
- 平台能力声明遵循诚实原则：未完成真实验收的能力标 `beta` / `未验收`，不得写成"支持"。能力矩阵以 [`docs/delivery/crm-release-status.md`](./docs/delivery/crm-release-status.md) 为准。

## Commit 规范

Conventional Commits（中英文描述均可）：

```
feat(prospecting): 支持按意向等级筛选潜客
fix(api): 修复跨组织查询缺少 organizationId 过滤
docs(readme): 对齐本地部署定位
```

## 安全相关

不要在 Issue/PR/日志/测试快照中包含明文密钥、Cookie、Token、手机号全量。发现安全漏洞请按 [`SECURITY.md`](./SECURITY.md) 私密披露，不要开公开 Issue。

## 许可证

提交即表示你同意贡献内容按 [Apache-2.0](./LICENSE) 授权。
