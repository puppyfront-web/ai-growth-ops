import { pbkdf2Sync, randomBytes } from 'node:crypto';
import type { DatabaseClient } from './client';

export const INITIAL_ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || 'admin@ai-growth-ops.local';
const INITIAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const INITIAL_ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString(
    'hex'
  );
  return `${salt}:${hash}`;
}

/**
 * Seed the database with an initial admin user.
 * Idempotent — safe to run multiple times.
 * Configure via env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */
export async function seedDatabase(db: DatabaseClient): Promise<void> {
  const existing = await db.user.findFirst({
    where: { email: INITIAL_ADMIN_EMAIL }
  });
  if (existing) {
    console.log(`[seed] Admin user already exists: ${INITIAL_ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = hashPassword(INITIAL_ADMIN_PASSWORD);
  const user = await db.user.create({
    data: {
      email: INITIAL_ADMIN_EMAIL,
      name: INITIAL_ADMIN_NAME,
      role: 'admin',
      passwordHash,
      metadata: { seeded: true }
    }
  });

  // Create a default organization for the seeded user
  const orgSlug = `admin-workspace-${randomBytes(4).toString('hex')}`;
  const org = await db.organization.create({
    data: {
      name: `${INITIAL_ADMIN_NAME}的工作空间`,
      slug: orgSlug,
      status: 'active',
      metadata: { isDefault: true }
    }
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
      status: 'active'
    }
  });

  console.log(`[seed] Created admin user: ${INITIAL_ADMIN_EMAIL}`);
  console.log(`[seed] Default password: ${INITIAL_ADMIN_PASSWORD}`);
  console.log(`[seed] Default organization: ${org.id}`);
  console.log(`[seed] ⚠️  Change the password immediately after first login.`);
}
