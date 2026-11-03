-- 回复建议/潜客与 Lead 关联（spec/53 T2/T1）
-- 增量迁移：仅新增可空列 + 索引 + 外键，历史行保持 NULL。

-- ReplySuggestion → Lead（可空：历史建议无线索关联）
ALTER TABLE "reply_suggestions" ADD COLUMN "leadId" TEXT;
CREATE INDEX "reply_suggestions_leadId_idx" ON "reply_suggestions"("leadId");
ALTER TABLE "reply_suggestions" ADD CONSTRAINT "reply_suggestions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ProspectCandidate → Lead（可空：转化时回填，T1 使用）
ALTER TABLE "prospect_candidates" ADD COLUMN "leadId" TEXT;
CREATE INDEX "prospect_candidates_leadId_idx" ON "prospect_candidates"("leadId");
ALTER TABLE "prospect_candidates" ADD CONSTRAINT "prospect_candidates_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
