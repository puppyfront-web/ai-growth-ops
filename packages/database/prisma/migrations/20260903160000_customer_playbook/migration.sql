-- CreateEnum
CREATE TYPE "CustomerPlaybookStatus" AS ENUM ('draft', 'active', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "customer_playbooks" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT,
    "actions" JSONB NOT NULL,
    "status" "CustomerPlaybookStatus" NOT NULL DEFAULT 'draft',
    "generatedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_playbooks_customerId_status_idx" ON "customer_playbooks"("customerId", "status");

-- CreateIndex
CREATE INDEX "customer_playbooks_customerId_createdAt_idx" ON "customer_playbooks"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "customer_playbooks" ADD CONSTRAINT "customer_playbooks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
