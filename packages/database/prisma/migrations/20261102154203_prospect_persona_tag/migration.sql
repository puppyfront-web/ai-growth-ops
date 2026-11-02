-- 潜客画像标签：语义评估两步判定的产物（39 号 spec）
-- 可空字符串，历史行保持 NULL 表示"未做画像判定"。
ALTER TABLE "prospect_candidates" ADD COLUMN "personaTag" TEXT;
