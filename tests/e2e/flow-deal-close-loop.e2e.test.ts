import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase, seedProspectCandidate } from './helpers';

/**
 * spec/08 测试矩阵的 E2E 闭环：
 * 潜客 → 转入客户 → 创建商机 → 赢单 → 客户状态与经营漏斗同步 → 内容分析可访问。
 * 全程使用种子数据与 Mock 账号，不触达真实平台。
 */
test.describe('Deal closed loop', () => {
  test('prospect converts to a customer, wins a deal and shows in the funnel', async ({
    page
  }) => {
    await resetAndSeedDatabase();
    const fixture = await seedProspectCandidate();
    await login(page);

    // 1. 潜客 → 客户
    await page.goto(`/prospecting/${fixture.taskId}`);
    await expect(
      page.getByText(fixture.candidateName).first()
    ).toBeVisible();
    await page.getByRole('button', { name: '转客户' }).first().click();

    const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
    await dialog.waitFor({ state: 'visible' });
    await dialog
      .getByPlaceholder('手机号（选填，后续人工补充）')
      .fill('13800138000');
    await dialog.getByRole('button', { name: '确认转入' }).click();

    const convertedNotice = page.getByText('已转入客户库').first();
    await expect(convertedNotice).toBeVisible();
    await page.getByRole('link', { name: '查看客户' }).click();
    await expect(page).toHaveURL(/\/customers\/[^/]+$/);
    await expect(
      page.getByRole('heading', { name: fixture.candidateName })
    ).toBeVisible();

    // 2. 客户 → 商机（创建时选“已确认需求”，之后才能流转到赢单）
    await page.getByRole('button', { name: '新建商机' }).click();
    await page
      .getByPlaceholder('如：年度私域工具采购')
      .fill('E2E 闭环商机');
    await page.getByLabel('金额（元）').fill('12000');
    await page.getByLabel('阶段').selectOption('qualified');
    await page.getByRole('button', { name: '创建商机' }).click();

    const dealRow = page.locator('li', { hasText: 'E2E 闭环商机' });
    await expect(dealRow).toBeVisible();
    await expect(dealRow.getByText('¥12,000')).toBeVisible();

    // 3. 商机赢单 → 客户状态同步为已成交
    await dealRow.locator('select').selectOption('won');
    await expect(
      page.getByText('当前：已成交')
    ).toBeVisible({ timeout: 10_000 });

    // 4. 经营漏斗统计成交与成交额
    await page.goto('/analytics/funnel');
    await expect(page.getByRole('heading', { name: '经营漏斗' })).toBeVisible();
    await expect(page.getByText('成交', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('¥12,000').first()).toBeVisible();

    // 5. 内容分析页可访问（归因数字由集成测试精确断言）
    await page.goto('/analytics/content');
    await expect(page.getByRole('heading', { name: '内容分析' })).toBeVisible();
    await expect(
      page.getByText('每条内容带来的互动、线索与成交')
    ).toBeVisible();
  });
});
