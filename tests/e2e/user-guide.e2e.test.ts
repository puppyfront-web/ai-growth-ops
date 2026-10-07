import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.beforeEach(async () => resetAndSeedDatabase());

test('first login shows the tour, spotlight steps work, skip persists', async ({
  page
}) => {
  await login(page, { dismissGuide: false });

  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('欢迎使用 AI Growth Ops');

  await page.getByRole('button', { name: '开始引导' }).click();
  await expect(dialog).toContainText('主导航');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(dialog).toContainText('智能获客');

  await page.getByRole('button', { name: '上一步' }).click();
  await expect(dialog).toContainText('主导航');

  await page.getByRole('button', { name: '跳过引导' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.waitForURL('**/prospecting');
  await expect(dialog).toBeHidden();
});

test('the tour can be reopened from the avatar menu after completion', async ({
  page
}) => {
  await login(page);

  await page.getByRole('button', { name: '用户菜单' }).click();
  await page.getByRole('menuitem', { name: '功能引导' }).click();

  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('欢迎使用 AI Growth Ops');
});
