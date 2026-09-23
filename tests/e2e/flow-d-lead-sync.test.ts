import { expect, test } from '@playwright/test';
import {
  login,
  resetAndSeedDatabase,
  seedProspectingAccount
} from './helpers';

test.describe('Keyword prospecting', () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    await login(page);
  });

  test('shows the prospecting workspace', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '关键词获客' })
    ).toBeVisible();
    await expect(page.getByText('暂无获客任务')).toBeVisible();
  });

  test('creates a prospecting task and opens its detail', async ({ page }) => {
    await seedProspectingAccount();
    await page.reload();
    await page.getByRole('button', { name: /新建任务/ }).click();
    await page
      .getByLabel('主题关键词（逗号或换行分隔）*')
      .fill('企业获客, 采购经理');
    await page.getByRole('button', { name: '创建并开始执行' }).click();

    await expect(page).toHaveURL(/\/prospecting\/[^/]+$/);
    await expect(page.getByText('企业获客')).toBeVisible();
    await expect(page.getByText(/状态：执行中/)).toBeVisible();
  });

  test('guides an organization without a logged-in account to integrations', async ({
    page
  }) => {
    await page.getByRole('button', { name: /新建任务/ }).click();
    await page
      .getByLabel('主题关键词（逗号或换行分隔）*')
      .fill('企业获客');
    await page.getByRole('button', { name: '创建并开始执行' }).click();

    await expect(page).toHaveURL('/integrations/platforms');
  });
});
