/*
  Warnings:

  - The values [mock_generated] on the enum `MediaSourceType` will be removed. If these variants are still used in the database, this will fail.
  - The values [mock] on the enum `ProviderMode` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `organizationId` to the `agent_runs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `content_projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `conversations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `interactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `lead_sink_configs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `platform_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `platform_capabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `publish_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `skill_runs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InteractionMode" AS ENUM ('official_api', 'webhook', 'browser_assist', 'manual_import', 'recorded', 'sandbox', 'disabled');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('info', 'warning', 'error', 'critical');

-- CreateEnum
CREATE TYPE "SystemTaskStatus" AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled', 'suspended');

-- CreateEnum
CREATE TYPE "ReplySuggestionStatus" AS ENUM ('draft', 'waiting_review', 'approved', 'rejected', 'sent', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReplyType" AS ENUM ('faq_answer', 'guide_to_private', 'guide_to_wecom', 'ask_more_info', 'thanks', 'complaint_response', 'manual_only');

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('draft', 'editing', 'ready_for_review', 'approved', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ComplianceRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('official_api', 'browser_assist', 'manual_confirm', 'sandbox', 'recorded', 'disabled');

-- CreateEnum
CREATE TYPE "ResearchMode" AS ENUM ('real_crawler', 'recorded', 'manual_import', 'disabled');

-- AlterEnum
BEGIN;
CREATE TYPE "MediaSourceType_new" AS ENUM ('uploaded', 'external_url', 'generated_future');
ALTER TABLE "media_assets" ALTER COLUMN "sourceType" DROP DEFAULT;
ALTER TABLE "media_assets" ALTER COLUMN "sourceType" TYPE "MediaSourceType_new" USING ("sourceType"::text::"MediaSourceType_new");
ALTER TYPE "MediaSourceType" RENAME TO "MediaSourceType_old";
ALTER TYPE "MediaSourceType_new" RENAME TO "MediaSourceType";
DROP TYPE "MediaSourceType_old";
ALTER TABLE "media_assets" ALTER COLUMN "sourceType" SET DEFAULT 'uploaded';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ProviderMode_new" AS ENUM ('official_api', 'browser_assist', 'manual_confirm', 'manual_import');
ALTER TABLE "platform_accounts" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "platform_capabilities" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "publish_jobs" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "platform_accounts" ALTER COLUMN "mode" TYPE "ProviderMode_new" USING ("mode"::text::"ProviderMode_new");
ALTER TABLE "platform_capabilities" ALTER COLUMN "mode" TYPE "ProviderMode_new" USING ("mode"::text::"ProviderMode_new");
ALTER TABLE "publish_jobs" ALTER COLUMN "mode" TYPE "ProviderMode_new" USING ("mode"::text::"ProviderMode_new");
ALTER TYPE "ProviderMode" RENAME TO "ProviderMode_old";
ALTER TYPE "ProviderMode_new" RENAME TO "ProviderMode";
DROP TYPE "ProviderMode_old";
ALTER TABLE "platform_accounts" ALTER COLUMN "mode" SET DEFAULT 'official_api';
ALTER TABLE "platform_capabilities" ALTER COLUMN "mode" SET DEFAULT 'official_api';
ALTER TABLE "publish_jobs" ALTER COLUMN "mode" SET DEFAULT 'official_api';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "tokensUsed" INTEGER;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "content_projects" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "content_variants" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "lead_sink_configs" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "platform_accounts" ADD COLUMN     "organizationId" TEXT NOT NULL,
ALTER COLUMN "mode" SET DEFAULT 'official_api';

-- AlterTable
ALTER TABLE "platform_capabilities" ADD COLUMN     "organizationId" TEXT NOT NULL,
ALTER COLUMN "mode" SET DEFAULT 'official_api';

-- AlterTable
ALTER TABLE "publish_jobs" ADD COLUMN     "organizationId" TEXT NOT NULL,
ALTER COLUMN "mode" SET DEFAULT 'official_api';

-- AlterTable
ALTER TABLE "research_tasks" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "skill_runs" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "token_blacklist" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
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

-- CreateTable
CREATE TABLE "organization_members" (
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

-- CreateTable
CREATE TABLE "organization_invitations" (
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

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "platforms" JSONB NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text_image',
    "scheduleConfig" JSONB,
    "topicConfig" JSONB,
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "autoCompliance" BOOLEAN NOT NULL DEFAULT true,
    "maxPostsTotal" INTEGER,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_runs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contentItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "steps" JSONB NOT NULL,
    "triggerConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "stepResults" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL DEFAULT 'info',
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_tasks" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SystemTaskStatus" NOT NULL DEFAULT 'queued',
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_refs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platform" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "value" DOUBLE PRECISION,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_classifications" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "leadLevel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "nextAction" TEXT,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_suggestions" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "suggestedText" TEXT NOT NULL,
    "replyType" "ReplyType" NOT NULL DEFAULT 'faq_answer',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "needReview" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "decisionReason" TEXT,
    "status" "ReplySuggestionStatus" NOT NULL DEFAULT 'draft',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_attempts" (
    "id" TEXT NOT NULL,
    "replySuggestionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalReplyId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_sync_jobs" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cursor" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interaction_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_compliance_checks" (
    "id" TEXT NOT NULL,
    "contentVariantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "riskLevel" "ComplianceRiskLevel" NOT NULL DEFAULT 'low',
    "issues" JSONB NOT NULL,
    "suggestedFixes" JSONB,
    "checkedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "loginRequired" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastScreenshotKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_publish_checklists" (
    "id" TEXT NOT NULL,
    "publishJobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_publish_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "toolResult" JSONB,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_blacklist_jti_key" ON "token_blacklist"("jti");

-- CreateIndex
CREATE INDEX "token_blacklist_jti_idx" ON "token_blacklist"("jti");

-- CreateIndex
CREATE INDEX "token_blacklist_expiresAt_idx" ON "token_blacklist"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_key" ON "organization_invitations"("token");

-- CreateIndex
CREATE INDEX "organization_invitations_inviteeEmail_status_idx" ON "organization_invitations"("inviteeEmail", "status");

-- CreateIndex
CREATE INDEX "organization_invitations_organizationId_idx" ON "organization_invitations"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_idx" ON "campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "campaigns_status_nextRunAt_idx" ON "campaigns"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "campaign_runs_campaignId_scheduledAt_idx" ON "campaign_runs"("campaignId", "scheduledAt");

-- CreateIndex
CREATE INDEX "campaign_runs_status_scheduledAt_idx" ON "campaign_runs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "workflows_organizationId_idx" ON "workflows"("organizationId");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_idx" ON "workflow_executions"("workflowId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "system_tasks_status_createdAt_idx" ON "system_tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "app_configs_organizationId_idx" ON "app_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_userId_key_key" ON "app_configs"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "secret_refs_scope_key_key" ON "secret_refs"("scope", "key");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_occurredAt_idx" ON "analytics_events"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_platform_occurredAt_idx" ON "analytics_events"("platform", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "interaction_classifications_interactionId_key" ON "interaction_classifications"("interactionId");

-- CreateIndex
CREATE INDEX "reply_suggestions_interactionId_status_idx" ON "reply_suggestions"("interactionId", "status");

-- CreateIndex
CREATE INDEX "reply_attempts_platform_status_idx" ON "reply_attempts"("platform", "status");

-- CreateIndex
CREATE INDEX "interaction_sync_jobs_platform_status_idx" ON "interaction_sync_jobs"("platform", "status");

-- CreateIndex
CREATE INDEX "content_compliance_checks_contentVariantId_idx" ON "content_compliance_checks"("contentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_publish_checklists_publishJobId_key" ON "manual_publish_checklists"("publishJobId");

-- CreateIndex
CREATE INDEX "chat_threads_organizationId_userId_updatedAt_idx" ON "chat_threads"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "chat_messages_threadId_createdAt_idx" ON "chat_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_organizationId_idx" ON "agent_runs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "content_items_organizationId_idx" ON "content_items"("organizationId");

-- CreateIndex
CREATE INDEX "content_projects_organizationId_idx" ON "content_projects"("organizationId");

-- CreateIndex
CREATE INDEX "content_variants_organizationId_idx" ON "content_variants"("organizationId");

-- CreateIndex
CREATE INDEX "conversations_organizationId_idx" ON "conversations"("organizationId");

-- CreateIndex
CREATE INDEX "interactions_organizationId_idx" ON "interactions"("organizationId");

-- CreateIndex
CREATE INDEX "lead_sink_configs_organizationId_idx" ON "lead_sink_configs"("organizationId");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "media_assets_organizationId_idx" ON "media_assets"("organizationId");

-- CreateIndex
CREATE INDEX "platform_accounts_organizationId_idx" ON "platform_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "platform_capabilities_organizationId_idx" ON "platform_capabilities"("organizationId");

-- CreateIndex
CREATE INDEX "publish_jobs_organizationId_idx" ON "publish_jobs"("organizationId");

-- CreateIndex
CREATE INDEX "research_tasks_organizationId_idx" ON "research_tasks"("organizationId");

-- CreateIndex
CREATE INDEX "skill_runs_organizationId_idx" ON "skill_runs"("organizationId");

-- AddForeignKey
ALTER TABLE "token_blacklist" ADD CONSTRAINT "token_blacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_capabilities" ADD CONSTRAINT "platform_capabilities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sink_configs" ADD CONSTRAINT "lead_sink_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_runs" ADD CONSTRAINT "skill_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_configs" ADD CONSTRAINT "app_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_classifications" ADD CONSTRAINT "interaction_classifications_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_suggestions" ADD CONSTRAINT "reply_suggestions_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_attempts" ADD CONSTRAINT "reply_attempts_replySuggestionId_fkey" FOREIGN KEY ("replySuggestionId") REFERENCES "reply_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_compliance_checks" ADD CONSTRAINT "content_compliance_checks_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_publish_checklists" ADD CONSTRAINT "manual_publish_checklists_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
