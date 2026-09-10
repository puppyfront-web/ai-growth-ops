-- Quota is per logged-in cookie (platform account), not per operator.
CREATE TABLE "prospecting_guard_ledgers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "videosCrawled" INTEGER NOT NULL DEFAULT 0,
    "profilesFetched" INTEGER NOT NULL DEFAULT 0,
    "captchaBlockedUntil" TIMESTAMP(3),
    "lastVideoAt" TIMESTAMP(3),
    "lastProfileAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospecting_guard_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prospecting_guard_ledgers_organizationId_platformAccountId_date_key"
  ON "prospecting_guard_ledgers"("organizationId", "platformAccountId", "date");

CREATE INDEX "prospecting_guard_ledgers_platformAccountId_date_idx"
  ON "prospecting_guard_ledgers"("platformAccountId", "date");

ALTER TABLE "prospecting_guard_ledgers"
  ADD CONSTRAINT "prospecting_guard_ledgers_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prospecting_guard_ledgers"
  ADD CONSTRAINT "prospecting_guard_ledgers_platformAccountId_fkey"
  FOREIGN KEY ("platformAccountId") REFERENCES "platform_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prospecting_crawled_videos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "videoId" TEXT NOT NULL,
    "lastCrawledAt" TIMESTAMP(3) NOT NULL,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospecting_crawled_videos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prospecting_crawled_videos_organizationId_platform_videoId_key"
  ON "prospecting_crawled_videos"("organizationId", "platform", "videoId");

CREATE INDEX "prospecting_crawled_videos_organizationId_lastCrawledAt_idx"
  ON "prospecting_crawled_videos"("organizationId", "lastCrawledAt");

ALTER TABLE "prospecting_crawled_videos"
  ADD CONSTRAINT "prospecting_crawled_videos_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
