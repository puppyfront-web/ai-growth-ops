import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.beforeEach(async () => resetAndSeedDatabase());

test('old calendar and folder links reach consolidated views', async ({ page }) => {
  await login(page);
  await page.goto('/publish/calendar');
  await expect(page).toHaveURL(/\/content\/calendar$/);
  await expect(page.getByRole('heading', { name: '运营日历' })).toBeVisible();
  await page.getByRole('combobox', { name: '显示事件' }).selectOption('publish');
  await page.goto('/media/folders');
  await expect(page).toHaveURL(/\/media$/);
  await page.getByRole('combobox', { name: '素材来源' }).selectOption('uploaded');
});

test('settings directs model setup to the organization configuration', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: /LLM 配置/ }).click();
  await expect(page).toHaveURL(/\/integrations\/llm$/);
  await page.goto('/settings/ai');
  await expect(page.getByRole('heading', { name: '素材生成配置', exact: true }).first()).toBeVisible();
  await expect(page.getByText('功能开关', { exact: true })).toHaveCount(0);
});
