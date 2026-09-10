import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.beforeEach(async () => {
  await resetAndSeedDatabase();
});

test('prospecting workspace loads after login', async ({ page }) => {
  await login(page);

  await expect(page.getByRole('heading', { name: '关键词获客' })).toBeVisible();
});
