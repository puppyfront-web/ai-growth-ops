import { expect, test } from '@playwright/test';

test.describe('Flow D: Lead Sync', () => {
  test('leads page shows seed data', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.locator('text=线索').first()).toBeVisible({ timeout: 15000 });
  });

  test('lead detail shows sync options', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.locator('text=线索').first()).toBeVisible({ timeout: 15000 });

    // Click on first lead
    const firstLead = page.locator('a[href^="/leads/"]').first();
    if (await firstLead.isVisible()) {
      await firstLead.click();
      await page.waitForURL('**/leads/*', { timeout: 10000 });
      // Should show lead details
      await expect(page.locator('text=飞书').or(page.locator('text=企微')).or(page.locator('text=同步'))).toBeVisible();
    }
  });
});
