import { expect, test } from '@playwright/test';
import { login, resetAndSeedDatabase } from './helpers';

test.beforeEach(async () => resetAndSeedDatabase());

test('first login shows the single-screen module guide and dismissal persists', async ({
  page
}) => {
  await login(page, { dismissGuide: false });

  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('欢迎使用 AI Growth Ops');

  // 单屏总览：每个可见模块的入口都在同一屏内
  await expect(dialog.getByText('智能获客')).toBeVisible();
  await expect(dialog.getByText('内容运营')).toBeVisible();
  await expect(dialog.getByText('集成配置')).toBeVisible();

  // 主行动关闭引导并持久化，刷新后不再出现
  await page.getByRole('button', { name: '开始使用' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.waitForURL('**/prospecting');
  await expect(dialog).toBeHidden();
});

test('the guide can be reopened from the avatar menu after completion', async ({
  page
}) => {
  await login(page);

  await page.getByRole('button', { name: '用户菜单' }).click();
  await page.getByRole('menuitem', { name: '功能引导' }).click();

  const dialog = page.locator('div[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('欢迎使用 AI Growth Ops');
});
