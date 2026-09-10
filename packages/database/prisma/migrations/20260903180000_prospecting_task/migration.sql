-- CreateEnum
CREATE TYPE "ProspectingTaskStatus" AS ENUM ('draft', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "prospecting_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "keywords" JSONB NOT NULL,
    "status" "ProspectingTaskStatus" NOT NULL DEFAULT 'draft',
    "topNVideos" INTEGER NOT NULL DEFAULT 5,
    "maxCommentsPerVideo" INTEGER NOT NULL DEFAULT 30,
    "commentScrollRounds" INTEGER NOT NULL DEFAULT 8,
    "minRelevanceScore" INTEGER NOT NULL DEFAULT 40,
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "totalCandidates" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "prospecting_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_candidates" (
    "id" TEXT NOT NULL,
    "prospectingTaskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "keyword" TEXT NOT NULL,
    "externalUserId" TEXT,
    "userNickname" TEXT,
    "content" TEXT NOT NULL,
    "sourceVideoTitle" TEXT,
    "sourceVideoUrl" TEXT,
    "sourceVideoAuthor" TEXT,
    "sourcePostId" TEXT,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "leadLevel" TEXT NOT NULL,
    "intent" TEXT,
    "summary" TEXT,
    "matchedKeywords" JSONB,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "prospect_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospecting_tasks_organizationId_status_idx" ON "prospecting_tasks"("organizationId", "status");

-- CreateIndex
CREATE INDEX "prospecting_tasks_organizationId_createdAt_idx" ON "prospecting_tasks"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "prospect_candidates_prospectingTaskId_relevanceScore_idx" ON "prospect_candidates"("prospectingTaskId", "relevanceScore");

-- CreateIndex
CREATE INDEX "prospect_candidates_organizationId_createdAt_idx" ON "prospect_candidates"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "prospect_candidates_customerId_idx" ON "prospect_candidates"("customerId");

-- AddForeignKey
ALTER TABLE "prospecting_tasks" ADD CONSTRAINT "prospecting_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecting_tasks" ADD CONSTRAINT "prospecting_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_candidates" ADD CONSTRAINT "prospect_candidates_prospectingTaskId_fkey" FOREIGN KEY ("prospectingTaskId") REFERENCES "prospecting_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_candidates" ADD CONSTRAINT "prospect_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_candidates" ADD CONSTRAINT "prospect_candidates_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
