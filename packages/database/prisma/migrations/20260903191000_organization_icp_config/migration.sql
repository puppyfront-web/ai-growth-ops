CREATE TABLE "organization_icp_configs" (
  "organizationId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_icp_configs_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "organization_icp_configs"
  ADD CONSTRAINT "organization_icp_configs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "organization_icp_configs" (
  "organizationId",
  "value",
  "updatedBy",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON ("organizationId")
  "organizationId",
  "value",
  "userId",
  "createdAt",
  "updatedAt"
FROM "app_configs"
WHERE "key" = 'icp_config'
ORDER BY "organizationId", "updatedAt" DESC
ON CONFLICT ("organizationId") DO NOTHING;
