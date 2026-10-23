# 平台账号多用户安全 Plan

1. Red：补 DTO/秘密配置单元测试，以及账号 RBAC、能力归属、组织级重名集成测试。
2. Green：增加平台账号 DTO 与秘密 metadata 辅助函数；为写操作和健康检查增加 `integration:manage` 守卫。
3. Green：能力更新增加 `organizationId + platformAccountId + id` 校验。
4. Green：调整 Prisma 组织级唯一约束并新增增量迁移，账号恢复逻辑改为组织维度。
5. Green：Web 类型和授权状态改用脱敏布尔字段，秘密输入不回显。
6. Refactor：账号响应统一经过 DTO，不保留散落的凭据字段判断。
7. Verify：受影响单元/Web/集成测试、`pnpm typecheck`、`pnpm lint`、迁移链检查。
8. Report：分别报告代码、自动化测试、迁移和真实平台验收；两个真实账号 Profile 与小红书继续列为待验收。
