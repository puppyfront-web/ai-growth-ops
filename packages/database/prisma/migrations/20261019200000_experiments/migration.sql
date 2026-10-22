-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'running', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL DEFAULT 'conversion',
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "variants" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_assignments" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_events" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "experiment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiments_organizationId_status_idx" ON "experiments"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_assignments_experimentId_entityType_entityId_key" ON "experiment_assignments"("experimentId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "experiment_assignments_experimentId_variantKey_idx" ON "experiment_assignments"("experimentId", "variantKey");

-- CreateIndex
CREATE INDEX "experiment_events_experimentId_metric_occurredAt_idx" ON "experiment_events"("experimentId", "metric", "occurredAt");

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "experiment_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
