-- Prospecting results are delivered per user, not per comment.
ALTER TABLE "prospect_candidates" ADD COLUMN "userKey" TEXT;
ALTER TABLE "prospect_candidates" ADD COLUMN "userHomepage" TEXT;
ALTER TABLE "prospect_candidates" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "prospect_candidates" ADD COLUMN "commentCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "prospect_candidates" ADD COLUMN "evidence" JSONB;
ALTER TABLE "prospect_candidates" ADD COLUMN "scoreSource" TEXT NOT NULL DEFAULT 'rules';

UPDATE "prospect_candidates"
SET "userKey" = COALESCE(NULLIF("externalUserId", ''), NULLIF("userNickname", ''), "id");

-- Comment-level rows can collide once collapsed onto a user key; keep the
-- highest scoring row per user so the new unique index can be created.
DELETE FROM "prospect_candidates" a
USING "prospect_candidates" b
WHERE a."prospectingTaskId" = b."prospectingTaskId"
  AND a."userKey" = b."userKey"
  AND (a."relevanceScore", a."createdAt", a."id") < (b."relevanceScore", b."createdAt", b."id");

ALTER TABLE "prospect_candidates" ALTER COLUMN "userKey" SET NOT NULL;

CREATE UNIQUE INDEX "prospect_candidates_prospectingTaskId_userKey_key"
  ON "prospect_candidates"("prospectingTaskId", "userKey");
