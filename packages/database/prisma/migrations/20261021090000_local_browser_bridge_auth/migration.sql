ALTER TABLE "browser_sessions"
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local_bridge',
ADD COLUMN "bridgeTokenHash" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "metadata" JSONB;

CREATE INDEX "browser_sessions_organizationId_platformAccountId_status_idx"
ON "browser_sessions"("organizationId", "platformAccountId", "status");

CREATE INDEX "browser_sessions_bridgeTokenHash_idx"
ON "browser_sessions"("bridgeTokenHash");

CREATE INDEX "browser_sessions_expiresAt_idx"
ON "browser_sessions"("expiresAt");
