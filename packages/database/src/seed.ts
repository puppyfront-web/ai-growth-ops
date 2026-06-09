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
  await db.user.create({
    data: {
      email: INITIAL_ADMIN_EMAIL,
      name: INITIAL_ADMIN_NAME,
      role: 'admin',
      passwordHash,
      metadata: { seeded: true }
    }
  });

  console.log(`[seed] Created admin user: ${INITIAL_ADMIN_EMAIL}`);
  console.log(`[seed] Default password: ${INITIAL_ADMIN_PASSWORD}`);
  console.log(`[seed] ⚠️  Change the password immediately after first login.`);
}
