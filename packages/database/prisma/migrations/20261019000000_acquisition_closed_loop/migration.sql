-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- AlterTable
ALTER TABLE "leads"
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers"
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'new',
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "expectedCloseDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "sourceChannel" "AcquisitionChannel",
    "sourceContentItemId" TEXT,
    "sourcePublishJobId" TEXT,
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_activities" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "operator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "deal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_organizationId_nextActionAt_idx" ON "leads"("organizationId", "nextActionAt");

-- CreateIndex
CREATE INDEX "customers_organizationId_nextActionAt_idx" ON "customers"("organizationId", "nextActionAt");

-- CreateIndex
CREATE INDEX "deals_organizationId_stage_idx" ON "deals"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "deals_organizationId_nextActionAt_idx" ON "deals"("organizationId", "nextActionAt");

-- CreateIndex
CREATE INDEX "deals_organizationId_wonAt_idx" ON "deals"("organizationId", "wonAt");

-- CreateIndex
CREATE INDEX "deals_customerId_idx" ON "deals"("customerId");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deal_activities_dealId_createdAt_idx" ON "deal_activities"("dealId", "createdAt");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
