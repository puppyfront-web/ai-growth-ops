DROP INDEX IF EXISTS "platform_accounts_userId_platform_name_key";

CREATE UNIQUE INDEX "platform_accounts_organizationId_platform_name_key"
ON "platform_accounts"("organizationId", "platform", "name");
