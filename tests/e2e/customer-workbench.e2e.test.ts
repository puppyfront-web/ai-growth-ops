import { expect, test } from '@playwright/test';

test('dashboard loads and shows seed data metrics', async ({ page }) => {
  await page.goto('/dashboard');

  // Dashboard should show metrics from seed data
  await expect(page.locator('text=平台账号').or(page.locator('text=内容')).or(page.locator('text=发布'))).toBeVisible({ timeout: 15000 });
});
