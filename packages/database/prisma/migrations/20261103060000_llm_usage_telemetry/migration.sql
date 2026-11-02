-- LLM 用量遥测（43 号 spec）：ProviderRunLog 此前零写入。
-- 新增可空字段 + 组织索引；回滚：DROP INDEX / DROP COLUMN。
ALTER TABLE "provider_run_logs" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "provider_run_logs" ADD COLUMN "model" TEXT;
ALTER TABLE "provider_run_logs" ADD COLUMN "promptTokens" INTEGER;
ALTER TABLE "provider_run_logs" ADD COLUMN "completionTokens" INTEGER;
ALTER TABLE "provider_run_logs" ADD COLUMN "totalTokens" INTEGER;

CREATE INDEX "provider_run_logs_organizationId_createdAt_idx" ON "provider_run_logs"("organizationId", "createdAt");
