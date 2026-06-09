import 'dotenv/config';
import { expect, test } from '@playwright/test';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';

test.beforeEach(async () => {
  const db = createDatabaseClient();
  try {
    await resetDatabase(db);
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
});

test('research mvp sync run creates results and content', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@ai-growth-ops.local');
  await page.getByLabel('密码').fill('changeme123');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/dashboard');

  await page.goto('/research/new');
  await page.getByLabel('任务类型').selectOption('keyword_search');
  await page.getByLabel('小红书').check();
  await page.getByLabel('关键词（用逗号分隔）').fill('AI获客, 内容营销');
  await page.getByRole('button', { name: '创建任务' }).click();

  await expect(page).toHaveURL(/\/research\/tasks\//);
  await page.getByRole('button', { name: '运行任务' }).click();
  await expect(page.getByRole('button', { name: 'AI 洞察' })).toBeVisible();
  await page.getByRole('button', { name: 'AI 洞察' }).click();
  await expect(page.getByText('热门内容主题分析')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '生成内容' }).first()
  ).toBeVisible();
  await page.getByRole('button', { name: '生成内容' }).first().click();
  await expect(page.getByText('已生成内容')).toBeVisible();
});
