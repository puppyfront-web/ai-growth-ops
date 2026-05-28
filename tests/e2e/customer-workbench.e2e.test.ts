import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';

test.beforeEach(async () => {
  const db = createDatabaseClient();
  try {
    await resetDatabase(db);
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
});

test('dashboard loads after login and shows key metrics', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@ai-growth-ops.local');
  await page.getByLabel('密码').fill('changeme123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/dashboard');

  await expect(page.getByText('运营工作台')).toBeVisible();
  await expect(page.getByText('平台账号')).toBeVisible();
  await expect(page.getByRole('heading', { name: '调研洞察' })).toBeVisible();
});
