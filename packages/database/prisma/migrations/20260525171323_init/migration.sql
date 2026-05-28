-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('douyin', 'xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu');

-- CreateEnum
CREATE TYPE "ProviderMode" AS ENUM ('official_api', 'browser_assist', 'manual_confirm', 'manual_import', 'mock');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'expired', 'disabled', 'error');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('text_image', 'video', 'article', 'answer');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'RUNNING', 'WAITING_HUMAN_CONFIRM', 'PUBLISHED', 'FAILED', 'NEED_MANUAL_REPAIR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('comment', 'message', 'official_message', 'form_submission');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('NEW', 'NORMALIZED', 'CLASSIFYING', 'CLASSIFIED', 'REPLY_SUGGESTED', 'WAITING_HUMAN_REVIEW', 'REPLIED', 'CONVERTED_TO_LEAD', 'IGNORED');

-- CreateEnum
CREATE TYPE "LeadLevel" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'SYNCING', 'SYNCED', 'ASSIGNED', 'CONTACTED', 'ADDED_WECOM', 'WON', 'LOST', 'INVALID');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'ANALYZING', 'INSIGHT_GENERATED', 'FAILED', 'PAUSED');

-- CreateEnum
CREATE TYPE "MediaSourceType" AS ENUM ('uploaded', 'external_url', 'generated_future', 'mock_generated');

-- CreateEnum
CREATE TYPE "MediaReviewStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ProviderRunStatus" AS ENUM ('pending', 'running', 'success', 'failed', 'timeout');

-- CreateEnum
CREATE TYPE "SkillRunStatus" AS ENUM ('pending', 'running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'publish', 'sync', 'ai_generate', 'approve', 'reject');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ProviderMode" NOT NULL DEFAULT 'mock',
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "authType" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "cookieRef" TEXT,
    "capabilities" JSONB,
    "lastHealthCheckAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_capabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "mode" "ProviderMode" NOT NULL DEFAULT 'mock',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "platform_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "content_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "sourceType" TEXT,
    "sourceResearchTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_variants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "tags" JSONB,
    "cta" TEXT,
    "mediaAssetIds" JSONB,
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "content_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER,
    "sourceType" "MediaSourceType" NOT NULL DEFAULT 'uploaded',
    "sourceUrl" TEXT,
    "reviewStatus" "MediaReviewStatus" NOT NULL DEFAULT 'approved',
    "generationProvider" TEXT,
    "generationPromptHash" TEXT,
    "costEstimate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentVariantId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "mode" "ProviderMode" NOT NULL DEFAULT 'mock',
    "status" "PublishJobStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "externalUrl" TEXT,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_attempts" (
    "id" TEXT NOT NULL,
    "publishJobId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "screenshotId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "conversationId" TEXT,
    "publishJobId" TEXT,
    "externalInteractionId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalUserName" TEXT,
    "type" "InteractionType" NOT NULL,
    "content" TEXT NOT NULL,
    "rawPayload" JSONB,
    "status" "InteractionStatus" NOT NULL DEFAULT 'NEW',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalUserName" TEXT,
    "status" "InteractionStatus" NOT NULL DEFAULT 'NEW',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePlatform" "Platform" NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "sourceInteractionId" TEXT,
    "sourcePublishJobId" TEXT,
    "externalUserId" TEXT NOT NULL,
    "externalUserName" TEXT,
    "level" "LeadLevel" NOT NULL DEFAULT 'C',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "tags" JSONB,
    "assignedTo" TEXT,
    "nextAction" TEXT,
    "riskLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "operator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sink_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sinkType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "lead_sink_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_external_mappings" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sinkType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "lead_external_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sink_sync_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sinkType" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "lead_sink_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platforms" JSONB,
    "keywords" JSONB,
    "targetAccountConfigs" JSONB,
    "status" "ResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT,
    "rateLimitPolicy" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_keywords" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "platform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_target_accounts" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_target_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collected_posts" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "collected_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collected_comments" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "externalPostId" TEXT,
    "externalUserId" TEXT,
    "externalUserName" TEXT,
    "content" TEXT NOT NULL,
    "likeCount" INTEGER,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "collected_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_insights" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_opportunities" (
    "id" TEXT NOT NULL,
    "researchTaskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "platforms" JSONB,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "status" "SkillRunStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "traceId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "skill_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "traceId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_run_logs" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerVersion" TEXT,
    "operation" TEXT NOT NULL,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "status" "ProviderRunStatus" NOT NULL DEFAULT 'pending',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "screenshotAssetId" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "provider_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_userId_platform_name_key" ON "platform_accounts"("userId", "platform", "name");

-- CreateIndex
CREATE UNIQUE INDEX "platform_capabilities_platformAccountId_capabilityKey_key" ON "platform_capabilities"("platformAccountId", "capabilityKey");

-- CreateIndex
CREATE UNIQUE INDEX "content_variants_contentItemId_platform_contentType_key" ON "content_variants"("contentItemId", "platform", "contentType");

-- CreateIndex
CREATE UNIQUE INDEX "publish_jobs_contentVariantId_platformAccountId_mode_key" ON "publish_jobs"("contentVariantId", "platformAccountId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "interactions_platformAccountId_externalInteractionId_key" ON "interactions"("platformAccountId", "externalInteractionId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_platformAccountId_externalUserId_key" ON "conversations"("platformAccountId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_sourcePlatform_sourceAccountId_externalUserId_key" ON "leads"("sourcePlatform", "sourceAccountId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_external_mappings_leadId_sinkType_key" ON "lead_external_mappings"("leadId", "sinkType");

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_capabilities" ADD CONSTRAINT "platform_capabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_capabilities" ADD CONSTRAINT "platform_capabilities_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "content_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourceInteractionId_fkey" FOREIGN KEY ("sourceInteractionId") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourcePublishJobId_fkey" FOREIGN KEY ("sourcePublishJobId") REFERENCES "publish_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_external_mappings" ADD CONSTRAINT "lead_external_mappings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sink_sync_logs" ADD CONSTRAINT "lead_sink_sync_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_tasks" ADD CONSTRAINT "research_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_keywords" ADD CONSTRAINT "research_keywords_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_target_accounts" ADD CONSTRAINT "research_target_accounts_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_posts" ADD CONSTRAINT "collected_posts_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_comments" ADD CONSTRAINT "collected_comments_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_insights" ADD CONSTRAINT "research_insights_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_researchTaskId_fkey" FOREIGN KEY ("researchTaskId") REFERENCES "research_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
