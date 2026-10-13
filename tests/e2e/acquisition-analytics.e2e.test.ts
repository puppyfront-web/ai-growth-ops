import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.describe('Acquisition analytics', () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    await login(page);
  });

  test('shows the prospect-to-customer review board', async ({ page }) => {
    await page.goto('/analytics/lead');
    await expect(page.getByRole('heading', { name: '获客分析' })).toBeVisible();
    // 第一阶段去模板化已删除页面级解说词，这里只断言结构性内容
    await expect(page.getByRole('button', { name: '7 天' })).toBeVisible();
    await expect(page.getByRole('button', { name: '30 天' })).toBeVisible();
    await expect(
      page.getByText(/这 30 天还没有获客任务或潜客/)
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '去创建智能获客任务' })
    ).toHaveAttribute('href', '/prospecting');
  });
});
