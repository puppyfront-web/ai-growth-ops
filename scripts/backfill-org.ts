/**
 * Migration: Add organizationId to all business tables and backfill with default org per user.
 *
 * Strategy:
 * 1. Create default Organization for each existing User
 * 2. Add OrganizationMember for each User → their default Org
 * 3. Backfill all business tables with the correct organizationId
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-|-$/g, '') || `org-${randomBytes(4).toString('hex')}`
  );
}

async function main() {
  console.log('Starting multi-tenancy migration...');

  // Step 1: Get all existing users
  const users = await prisma.user.findMany({ where: { deletedAt: null } });
  console.log(`Found ${users.length} users`);

  if (users.length === 0) {
    console.log('No users found, nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  // Step 2: Create default Organization for each user
  const userOrgMap = new Map<string, string>(); // userId → organizationId

  for (const user of users) {
    const slug = `${slugify(user.name)}-${randomBytes(4).toString('hex')}`;
    const org = await prisma.organization.create({
      data: {
        name: `${user.name}的工作空间`,
        slug,
        status: 'active',
        metadata: { isDefault: true, createdByMigration: true }
      }
    });
    userOrgMap.set(user.id, org.id);
    console.log(
      `  Created org "${org.name}" (${org.id}) for user ${user.email}`
    );
  }

  // Step 3: Create OrganizationMember for each user
  for (const user of users) {
    const orgId = userOrgMap.get(user.id)!;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: 'owner',
        status: 'active'
      }
    });
  }
  console.log('Created organization memberships');

  // Step 4: Backfill business tables using raw SQL
  // Table names in DB are PascalCase (no @@map for most models)
  const tables = [
    'PlatformAccount',
    'PlatformCapability',
    'ContentProject',
    'ContentItem',
    'ContentVariant',
    'MediaAsset',
    'PublishJob',
    'Interaction',
    'Conversation',
    'Lead',
    'LeadSinkConfig',
    'ResearchTask',
    'SkillRun',
    'AgentRun',
    'AuditLog',
    'AppConfig'
  ];

  for (const table of tables) {
    for (const user of users) {
      const orgId = userOrgMap.get(user.id)!;
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "organizationId" = $1 WHERE "userId" = $2 AND "organizationId" IS NULL`,
        orgId,
        user.id
      );
      if (result > 0) {
        console.log(`  ${table}: updated ${result} rows for ${user.email}`);
      }
    }
  }

  // Step 5: Backfill notifications (nullable userId)
  for (const user of users) {
    const orgId = userOrgMap.get(user.id)!;
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "Notification" SET "organizationId" = $1 WHERE "userId" = $2 AND "organizationId" IS NULL`,
      orgId,
      user.id
    );
    if (result > 0) {
      console.log(`  Notification: updated ${result} rows for ${user.email}`);
    }
  }

  console.log('Migration completed successfully!');
  console.log(`Created ${users.length} organizations`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
