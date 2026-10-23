# 平台账号多用户安全 SPEC

## 1. 背景

平台账号已经按组织共享，并支持团队成员、同平台多账号和账号自动调度，但账号管理接口的权限、能力项归属校验、凭据响应脱敏和组织内命名约束尚未形成一致边界。

## 2. 目标

1. 平台账号仍是组织级共享资源，同一组织可配置多个抖音或小红书账号。
2. 只有具备 `integration:manage` 权限的 owner/admin 可以创建、修改、删除和健康检查平台账号。
3. 所有账号与能力项写入同时校验当前组织和目标账号，拒绝跨组织或跨账号 ID。
4. 平台账号 HTTP 响应不返回 Token、Cookie、App Secret 或其密文，只返回是否已配置的布尔值。
5. 同一组织、同一平台、同一名称只能存在一个账号；软删除账号可恢复。
6. App Secret/Client Secret 服务端加密保存，编辑页面不回显秘密。

## 3. 非目标

- 不扩大主动获客默认平台；小红书继续保持 Beta。
- 不把自动化测试视为两个真实账号 Profile 隔离或小红书真实平台验收。
- 不改变发布、采集和互动任务选定账号后不自动换号的规则。

## 4. 数据与 API

- `PlatformAccount` 唯一约束由 `(userId, platform, name)` 调整为 `(organizationId, platform, name)`。
- `GET/POST/PUT /api/accounts` 返回脱敏 DTO：保留业务字段和能力列表，新增 `hasAccessToken`、`hasRefreshToken`、`hasCookie`、`hasSecretConfig`。
- `metadata` 仅返回非敏感配置；`appSecret`、`clientSecret` 及对应密文键不进入响应。
- 写入 `metadata` 时只允许公开键进入公开 metadata；秘密字段用 `encryptToken` 加密后保存。

## 5. 验收标准

1. viewer/member 调用账号创建、更新、删除、验证均返回 403；owner/admin 保持可用。
2. 用本组织账号提交另一账号或另一组织的 capability ID 返回 404/400，目标记录不变化。
3. 列表、创建和更新响应不包含 `accessTokenEncrypted`、`refreshTokenEncrypted`、`cookieRef`、`appSecret`、`clientSecret` 或秘密密文。
4. 同组织不同用户不能创建同平台同名账号；不同组织可使用相同名称。
5. 既有明文 secret 仅作为兼容读取输入，不再通过 API 输出；下次保存时转为密文。

## 6. 测试矩阵

- 单元：DTO 脱敏、秘密 metadata 加密/解密、公开 metadata 保留。
- 集成：四个账号写接口 RBAC、跨组织/跨账号 capability 拒绝、组织级同名冲突、响应脱敏。
- Web：使用 `hasCookie` 展示授权状态，编辑表单不回填秘密。
- 迁移：空库重放并检查 Prisma schema 无漂移。
