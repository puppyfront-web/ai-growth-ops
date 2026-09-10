import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

async function createCustomer(page: Parameters<typeof login>[0], name: string) {
  await page.goto('/customers');
  await page.getByRole('button', { name: /新建客户/ }).click();
  await page.getByLabel('姓名 *').fill(name);
  await page.getByLabel('手机号').fill('13800138000');
  await page.getByLabel('公司').fill('E2E 测试公司');
  await page.getByLabel('职位').fill('采购经理');
  await page.getByLabel('需求 *').fill('需要企业获客解决方案');
  await page.getByRole('button', { name: '保存客户' }).click();
  await expect(page.getByText(name)).toBeVisible();
}

test.describe('Customer management', () => {
  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    await login(page);
  });

  test('creates a customer', async ({ page }) => {
    await createCustomer(page, 'E2E 客户');
  });

  test('opens customer detail', async ({ page }) => {
    await createCustomer(page, 'E2E 详情客户');
    await page.getByRole('link', { name: 'E2E 详情客户' }).click();
    await expect(page).toHaveURL(/\/customers\/[^/]+$/);
    await expect(page.getByText('客户画像')).toBeVisible();
  });
});
