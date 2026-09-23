import { expect, test } from '@playwright/test';
import {
  login,
  resetAndSeedDatabase,
  seedConversationFixture,
  seedCustomerWithFeishuLink
} from './helpers';

test.describe('Thin customer workbench', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test('converts a conversation to one customer and links back to the thread', async ({
    page
  }) => {
    const fixture = await seedConversationFixture();
    await login(page);

    await page.goto(`/conversations/${fixture.conversationId}`);
    await expect(
      page.getByRole('heading', { name: fixture.customerName })
    ).toBeVisible();
    await page.getByRole('button', { name: '转入客户库' }).click();

    await expect(page).toHaveURL(/\/customers\/[^/]+$/);
    const customerUrl = page.url();
    await expect(page.getByRole('link', { name: '打开会话' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '同步飞书' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '审批执行' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '标记完成' })
    ).toHaveCount(0);
    await expect(page.getByText('AI 下一步建议')).toBeVisible();

    await page.getByRole('link', { name: '打开会话' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/conversations/${fixture.conversationId}$`)
    );

    await page.getByRole('button', { name: '转入客户库' }).click();
    await expect(page).toHaveURL(customerUrl);
  });

  test('rejects a duplicate phone unless confirmed, and opens a Feishu record', async ({
    page
  }) => {
    const feishu = await seedCustomerWithFeishuLink();
    await login(page);

    await page.goto('/customers');
    await page.getByRole('button', { name: /新建客户/ }).click();
    await page.getByLabel('姓名 *').fill('重复手机客户');
    await page.getByLabel('手机号').fill('13900139000');
    await page.getByLabel('公司').fill('另一家公司');
    await page.getByLabel('职位').fill('经理');
    await page.getByLabel('需求 *').fill('重复手机号');
    await page.getByRole('button', { name: '保存客户' }).click();
    await expect(page.getByText('发现重复客户')).toBeVisible();
    await page.goto(`/customers/${feishu.customerId}`);
    await expect(page).toHaveURL(new RegExp(`/customers/${feishu.customerId}$`));
    const feishuLink = page.getByRole('link', { name: '打开飞书记录' });
    await expect(feishuLink).toBeVisible();
    await expect(feishuLink).toHaveAttribute('href', feishu.feishuUrl);
  });
});
