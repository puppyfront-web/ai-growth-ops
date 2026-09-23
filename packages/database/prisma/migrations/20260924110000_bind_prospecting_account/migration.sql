ALTER TABLE "prospecting_tasks"
ADD COLUMN "platformAccountId" TEXT;

ALTER TABLE "prospecting_plan_drafts"
ADD COLUMN "platformAccountId" TEXT;

CREATE INDEX "prospecting_tasks_platformAccountId_idx"
ON "prospecting_tasks"("platformAccountId");

CREATE INDEX "prospecting_plan_drafts_platformAccountId_idx"
ON "prospecting_plan_drafts"("platformAccountId");

ALTER TABLE "prospecting_tasks"
ADD CONSTRAINT "prospecting_tasks_platformAccountId_fkey"
FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prospecting_plan_drafts"
ADD CONSTRAINT "prospecting_plan_drafts_platformAccountId_fkey"
FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
