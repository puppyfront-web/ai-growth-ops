import { expect, test } from '@playwright/test';
import {
  login,
  resetAndSeedDatabase,
  seedProspectingAccount,
  seedProspectingPlan
} from './helpers';

test.describe('Intent-driven prospecting', () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    await login(page);
  });

  test('shows the prospecting workspace', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '智能获客' })).toBeVisible();
    await expect(page.getByText('暂无获客任务')).toBeVisible();
  });

  test('creates a prospecting task and opens its detail', async ({ page }) => {
    const platformAccountId = await seedProspectingAccount();
    const analysis = await seedProspectingPlan(platformAccountId);
    await page.route('**/api/prospecting/plan', (route) =>
      route.fulfill({
        json: {
          ...analysis,
          guard: { videosRemaining: 60, estimatedMinutes: 2 }
        }
      })
    );
    await page.route('**/api/settings/llm', (route) =>
      route.fulfill({ json: { effectiveConfigured: true } })
    );
    await page.reload();
    await page.getByRole('button', { name: /新建任务/ }).click();
    await page
      .getByLabel('描述你想寻找的客户*')
      .fill(analysis.plan.requirement);
    await page.getByRole('button', { name: '分析需求' }).click();
    await expect(page.getByText('痛点求助')).toBeVisible();
    await page.getByRole('button', { name: '确认并开始获客' }).click();

    await expect(page).toHaveURL(/\/prospecting\/[^/]+$/);
    await expect(page.getByText(analysis.plan.requirement)).toBeVisible();
    await expect(page.getByText(/状态：执行中/)).toBeVisible();
  });

  test('blocks analysis when no logged-in account is available', async ({
    page
  }) => {
    const analysis = await seedProspectingPlan();
    await page.route('**/api/prospecting/plan', (route) =>
      route.fulfill({
        json: {
          ...analysis,
          guard: { videosRemaining: 60, estimatedMinutes: 2 }
        }
      })
    );
    await page.route('**/api/settings/llm', (route) =>
      route.fulfill({ json: { effectiveConfigured: true } })
    );
    await page.reload();
    await page.getByRole('button', { name: /新建任务/ }).click();
    await page
      .getByLabel('描述你想寻找的客户*')
      .fill(analysis.plan.requirement);
    await expect(
      page.getByText(/请先在「集成配置」完成抖音扫码登录/)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '分析需求' })).toBeDisabled();
  });
});
