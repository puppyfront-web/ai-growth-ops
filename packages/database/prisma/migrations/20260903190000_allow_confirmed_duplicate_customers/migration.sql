-- The application requires explicit confirmation before allowing duplicate
-- phone numbers. Enforce lookup performance in the database while leaving
-- the confirmation policy to the transactional service layer.
DROP INDEX IF EXISTS "customers_organizationId_phone_key";
CREATE INDEX IF NOT EXISTS "customers_organizationId_phone_idx"
  ON "customers"("organizationId", "phone");
