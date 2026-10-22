-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('ad', 'content', 'labor', 'tool', 'other');

-- CreateTable
CREATE TABLE "marketing_costs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "AcquisitionChannel",
    "contentItemId" TEXT,
    "category" "CostCategory" NOT NULL DEFAULT 'ad',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "marketing_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_costs_organizationId_incurredAt_idx" ON "marketing_costs"("organizationId", "incurredAt");

-- CreateIndex
CREATE INDEX "marketing_costs_organizationId_channel_idx" ON "marketing_costs"("organizationId", "channel");

-- AddForeignKey
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
