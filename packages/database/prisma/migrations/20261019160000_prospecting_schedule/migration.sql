-- AlterTable
ALTER TABLE "prospecting_tasks"
  ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scheduleIntervalHours" INTEGER,
  ADD COLUMN "nextRunAt" TIMESTAMP(3),
  ADD COLUMN "lastRunAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "prospecting_tasks_scheduleEnabled_nextRunAt_idx" ON "prospecting_tasks"("scheduleEnabled", "nextRunAt");
