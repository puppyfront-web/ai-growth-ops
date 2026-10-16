/**
 * UI 升级基线截图（docs/ui-ux-upgrade-plan.md A0）
 * 用法: node scripts/capture-ui-baseline.mjs
 * 前置: ./start.sh 已启动本地环境（web:3001, api:3100）
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const OUT = 'gui-test-screenshots/ui-upgrade-baseline';
const EMAIL = 'admin@ai-growth-ops.local';
const PASSWORD = 'changeme123';

const DESKTOP_PAGES = [
  ['dashboard', '/dashboard'],
  ['prospecting', '/prospecting'],
  ['review-queue', '/conversations/review'],
  ['content', '/content'],
  ['content-new', '/content/new'],
  ['publish-queue', '/publish/queue'],
  ['notifications', '/notifications'],
  ['leads', '/leads'],
  ['settings-ai', '/settings/ai'],
  ['analytics-lead', '/analytics/lead']
];

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('邮箱').fill(EMAIL);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/prospecting', { waitUntil: 'domcontentloaded' });
}

async function dismissGuide(page) {
  const dialog = page.locator('div[role="dialog"][aria-label="功能引导"]');
  await dialog.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// ── 桌面端 亮色 ──
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page = await ctx.newPage();
await login(page);
await dismissGuide(page);
for (const [name, path] of DESKTOP_PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/desktop-light-${name}.png`, fullPage: false });
  console.log(`✓ desktop-light-${name}`);
}

// ── 桌面端 暗色（工作台 + 获客 + 分析） ──
// eslint-disable-next-line no-undef -- localStorage 运行在 page.evaluate 的浏览器上下文里
await page.evaluate(() => localStorage.setItem('theme', 'dark'));
for (const [name, path] of [
  ['dashboard', '/dashboard'],
  ['prospecting', '/prospecting'],
  ['analytics-lead', '/analytics/lead']
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/desktop-dark-${name}.png` });
  console.log(`✓ desktop-dark-${name}`);
}
await ctx.close();

// ── 移动端 375×812 ──
ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
page = await ctx.newPage();
await login(page);
await dismissGuide(page);
for (const [name, path] of [
  ['dashboard', '/dashboard'],
  ['prospecting', '/prospecting'],
  ['review-queue', '/conversations/review']
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/mobile-${name}.png` });
  console.log(`✓ mobile-${name}`);
}
// 抽屉打开态
const hamburger = page.getByRole('button', { name: '打开导航菜单' });
if (await hamburger.isVisible().catch(() => false)) {
  await hamburger.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mobile-drawer.png` });
  console.log('✓ mobile-drawer');
}
await ctx.close();

await browser.close();
console.log(`\n基线截图完成 → ${OUT}/`);
