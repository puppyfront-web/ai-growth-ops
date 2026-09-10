import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.beforeEach(async () => {
  await resetAndSeedDatabase();
});

test('organization ICP configuration persists', async ({ page }) => {
  await login(page);

  await page.goto('/settings/icp');
  await page.getByPlaceholder('如：科技、制造、电商').fill('工业自动化');
  await page.getByRole('button', { name: '添加' }).first().click();

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/settings/icp') &&
      response.request().method() === 'PUT' &&
      response.ok()
  );
  await page.getByRole('button', { name: '保存配置' }).click();
  await saved;

  await page.reload();
  await expect(page.getByText('工业自动化')).toBeVisible();
});
