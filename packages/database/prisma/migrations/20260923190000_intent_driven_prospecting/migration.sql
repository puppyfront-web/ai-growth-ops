ALTER TABLE "prospecting_tasks"
ADD COLUMN "requirement" TEXT,
ADD COLUMN "intent" JSONB,
ADD COLUMN "strategyPlan" JSONB,
ADD COLUMN "planVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "prospect_candidates"
ADD COLUMN "attributions" JSONB,
ADD COLUMN "buyingStage" TEXT,
ADD COLUMN "confidence" INTEGER,
ADD COLUMN "riskFlags" JSONB;

CREATE TABLE "prospecting_plan_drafts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "requirement" TEXT NOT NULL,
  "intent" JSONB NOT NULL,
  "strategyPlan" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospecting_plan_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prospecting_plan_drafts_organizationId_userId_expiresAt_idx"
ON "prospecting_plan_drafts"("organizationId", "userId", "expiresAt");

ALTER TABLE "prospecting_plan_drafts"
ADD CONSTRAINT "prospecting_plan_drafts_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prospecting_plan_drafts"
ADD CONSTRAINT "prospecting_plan_drafts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
