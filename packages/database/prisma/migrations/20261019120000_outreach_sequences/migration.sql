-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('official_dm', 'wecom', 'email', 'phone_task', 'manual');

-- CreateEnum
CREATE TYPE "OutreachTouchStatus" AS ENUM ('planned', 'due', 'sending', 'sent', 'failed', 'skipped', 'replied');

-- CreateEnum
CREATE TYPE "OutreachEnrollmentStatus" AS ENUM ('active', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OutreachSuppressionType" AS ENUM ('customer', 'email', 'phone');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "deals" ADD COLUMN "slaEscalatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "outreach_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "OutreachChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "outreach_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_steps" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT NOT NULL,
    "requireReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "outreach_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_enrollments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "OutreachEnrollmentStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "outreach_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_touches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT,
    "channel" "OutreachChannel" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "OutreachTouchStatus" NOT NULL DEFAULT 'planned',
    "content" TEXT,
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "error" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "outreach_touches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_suppressions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "OutreachSuppressionType" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "outreach_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "assigneeId" TEXT,
    "strategy" TEXT NOT NULL DEFAULT 'fixed',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreach_sequences_organizationId_enabled_idx" ON "outreach_sequences"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_steps_sequenceId_order_key" ON "outreach_steps"("sequenceId", "order");

-- CreateIndex
CREATE INDEX "outreach_steps_sequenceId_idx" ON "outreach_steps"("sequenceId");

-- CreateIndex
CREATE INDEX "outreach_enrollments_organizationId_status_idx" ON "outreach_enrollments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "outreach_enrollments_customerId_status_idx" ON "outreach_enrollments"("customerId", "status");

-- CreateIndex
CREATE INDEX "outreach_touches_organizationId_status_scheduledAt_idx" ON "outreach_touches"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "outreach_touches_enrollmentId_scheduledAt_idx" ON "outreach_touches"("enrollmentId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_suppressions_organizationId_type_value_key" ON "outreach_suppressions"("organizationId", "type", "value");

-- CreateIndex
CREATE INDEX "outreach_suppressions_organizationId_type_idx" ON "outreach_suppressions"("organizationId", "type");

-- CreateIndex
CREATE INDEX "assignment_rules_organizationId_enabled_priority_idx" ON "assignment_rules"("organizationId", "enabled", "priority");

-- AddForeignKey
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_steps" ADD CONSTRAINT "outreach_steps_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "outreach_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "outreach_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_touches" ADD CONSTRAINT "outreach_touches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_touches" ADD CONSTRAINT "outreach_touches_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "outreach_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_touches" ADD CONSTRAINT "outreach_touches_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "outreach_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_suppressions" ADD CONSTRAINT "outreach_suppressions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
