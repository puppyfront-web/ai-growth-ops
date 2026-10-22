-- CreateTable
CREATE TABLE "lead_capture_forms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "submitMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "lead_capture_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_capture_submissions" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "message" TEXT,
    "source" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "lead_capture_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_capture_forms_slug_key" ON "lead_capture_forms"("slug");

-- CreateIndex
CREATE INDEX "lead_capture_forms_organizationId_enabled_idx" ON "lead_capture_forms"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "lead_capture_submissions_organizationId_createdAt_idx" ON "lead_capture_submissions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_capture_submissions_formId_createdAt_idx" ON "lead_capture_submissions"("formId", "createdAt");

-- AddForeignKey
ALTER TABLE "lead_capture_forms" ADD CONSTRAINT "lead_capture_forms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_capture_forms" ADD CONSTRAINT "lead_capture_forms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_capture_submissions" ADD CONSTRAINT "lead_capture_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "lead_capture_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_capture_submissions" ADD CONSTRAINT "lead_capture_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_capture_submissions" ADD CONSTRAINT "lead_capture_submissions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
