-- 询盘多渠道接入：AcquisitionChannel 新增 IM 渠道值，Customer 补齐邮箱与 IM 账号联系方式。
-- ALTER TYPE ... ADD VALUE 逐条追加，可重放；新值不回填历史行。
ALTER TYPE "AcquisitionChannel" ADD VALUE 'whatsapp';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'telegram';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'wechat_personal';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'email';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'messenger';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'instagram';
ALTER TYPE "AcquisitionChannel" ADD VALUE 'line';

ALTER TABLE "customers" ADD COLUMN "email" TEXT;
ALTER TABLE "customers" ADD COLUMN "imAccount" TEXT;

CREATE INDEX "customers_organizationId_email_idx" ON "customers"("organizationId", "email");
CREATE INDEX "customers_organizationId_imAccount_idx" ON "customers"("organizationId", "imAccount");
