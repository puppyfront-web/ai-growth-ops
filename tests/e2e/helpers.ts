import type { Page } from '@playwright/test';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';

function requireE2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('ai_growth_ops_e2e')) {
    throw new Error('Refusing to reset a non-e2e database');
  }
  return url;
}

export async function resetAndSeedDatabase(): Promise<void> {
  requireE2eDatabaseUrl();
  const db = createDatabaseClient();
  try {
    await resetDatabase(db);
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@ai-growth-ops.local');
  await page.getByLabel('密码').fill('changeme123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/prospecting');
}
