-- Step 1: Add nullable organizationId columns to all business tables
-- Run this BEFORE the backfill script

-- Organization tables
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE IF NOT EXISTS "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "organization_members_userId_idx" ON "organization_members"("userId");

CREATE TABLE IF NOT EXISTS "organization_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_token_key" ON "organization_invitations"("token");
CREATE INDEX IF NOT EXISTS "organization_invitations_inviteeEmail_status_idx" ON "organization_invitations"("inviteeEmail", "status");
CREATE INDEX IF NOT EXISTS "organization_invitations_organizationId_idx" ON "organization_invitations"("organizationId");

-- Add foreign keys for org tables
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 2: Add nullable organizationId to business tables
ALTER TABLE "platform_accounts" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "platform_capabilities" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "content_projects" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "content_items" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "content_variants" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "media_assets" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "publish_jobs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "interactions" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "lead_sink_configs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "skill_runs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "app_configs" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS "platform_accounts_organizationId_idx" ON "platform_accounts"("organizationId");
CREATE INDEX IF NOT EXISTS "platform_capabilities_organizationId_idx" ON "platform_capabilities"("organizationId");
CREATE INDEX IF NOT EXISTS "content_projects_organizationId_idx" ON "content_projects"("organizationId");
CREATE INDEX IF NOT EXISTS "content_items_organizationId_idx" ON "content_items"("organizationId");
CREATE INDEX IF NOT EXISTS "content_variants_organizationId_idx" ON "content_variants"("organizationId");
CREATE INDEX IF NOT EXISTS "media_assets_organizationId_idx" ON "media_assets"("organizationId");
CREATE INDEX IF NOT EXISTS "publish_jobs_organizationId_idx" ON "publish_jobs"("organizationId");
CREATE INDEX IF NOT EXISTS "interactions_organizationId_idx" ON "interactions"("organizationId");
CREATE INDEX IF NOT EXISTS "conversations_organizationId_idx" ON "conversations"("organizationId");
CREATE INDEX IF NOT EXISTS "leads_organizationId_idx" ON "leads"("organizationId");
CREATE INDEX IF NOT EXISTS "lead_sink_configs_organizationId_idx" ON "lead_sink_configs"("organizationId");
CREATE INDEX IF NOT EXISTS "research_tasks_organizationId_idx" ON "research_tasks"("organizationId");
CREATE INDEX IF NOT EXISTS "skill_runs_organizationId_idx" ON "skill_runs"("organizationId");
CREATE INDEX IF NOT EXISTS "agent_runs_organizationId_idx" ON "agent_runs"("organizationId");
CREATE INDEX IF NOT EXISTS "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");
CREATE INDEX IF NOT EXISTS "notifications_organizationId_idx" ON "notifications"("organizationId");
CREATE INDEX IF NOT EXISTS "app_configs_organizationId_idx" ON "app_configs"("organizationId");
