import { expect, test } from '@playwright/test';

test.describe('Flow B: Content → Publish', () => {
  test('create content and navigate to detail', async ({ page }) => {
    await page.goto('/content');
    await expect(page.locator('text=内容').first()).toBeVisible({ timeout: 15000 });

    // Navigate to new content page
    await page.goto('/content/new');
    await expect(page.locator('text=新建内容')).toBeVisible();

    // Fill form
    await page.fill('input[placeholder="输入内容标题"]', 'E2E测试内容');
    await page.selectOption('select', 'text_image');
    await page.fill('textarea[placeholder="输入正文内容..."]', '这是通过E2E测试创建的内容');

    // Submit
    await page.click('button:has-text("创建")');
    await page.waitForURL('**/content', { timeout: 10000 });
    await expect(page.locator('text=E2E测试内容')).toBeVisible();
  });

  test('content detail shows variants tab', async ({ page }) => {
    await page.goto('/content');
    await expect(page.locator('text=内容').first()).toBeVisible({ timeout: 15000 });

    // Click on first content item
    const firstItem = page.locator('a[href^="/content/"]').first();
    if (await firstItem.isVisible()) {
      await firstItem.click();
      await page.waitForURL('**/content/*', { timeout: 10000 });
      await expect(page.locator('text=正文').or(page.locator('text=平台版本'))).toBeVisible();
    }
  });
});
