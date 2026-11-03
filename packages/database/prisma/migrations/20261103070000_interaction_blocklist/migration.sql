-- InteractionBlocklist：评论/私信用户级黑名单/退订（spec/47 G1）
-- 增量迁移：仅新增表，不改动历史表。
CREATE TABLE "interaction_blocklists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "blockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "interaction_blocklists_pkey" PRIMARY KEY ("id")
);

-- 创建唯一索引：CREATE INDEX IF NOT EXISTS 语法见下
CREATE INDEX "interaction_blocklists_organizationId_idx" ON "interaction_blocklists"("organizationId");
-- 组织 + 平台 + 平台用户 联合唯一（软删除后重新拉黑走更新复活，不删除历史行）
CREATE UNIQUE INDEX "interaction_blocklists_organizationId_platform_platformUser_key" ON "interaction_blocklists"("organizationId", "platform", "platformUserId");
