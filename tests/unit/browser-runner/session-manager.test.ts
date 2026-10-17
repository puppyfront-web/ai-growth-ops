import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('playwright', () => ({ chromium: { launch: vi.fn() } }));
vi.mock('playwright-extra', () => ({
  chromium: { use: vi.fn(), launch: vi.fn() }
}));
vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn(() => ({}))
}));

import { chromium, type Browser } from 'playwright';
import { sessionManager } from '../../../apps/browser-runner/src/session-manager';

const FAKE_PNG = Buffer.from('fake-png-bytes');

interface FakeLocator {
  count: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  boundingBox: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
}

function fakeLocator(): FakeLocator {
  const api = {
    count: vi.fn(async () => 0),
    isVisible: vi.fn(async () => false),
    click: vi.fn(async () => {}),
    boundingBox: vi.fn(async () => null),
    first: vi.fn(() => api)
  };
  return api;
}

function makeFakeWorld() {
  const page = {
    goto: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    waitForURL: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    url: vi.fn(() => 'https://creator.douyin.com/'),
    screenshot: vi.fn(async () => FAKE_PNG),
    locator: vi.fn((_selector: string) => fakeLocator()),
    getByText: vi.fn(() => fakeLocator()),
    // 返回 null = 未找到二维码元素，走卡片/整页降级路径
    evaluate: vi.fn(async () => null),
    context: vi.fn(() => context)
  };
  const context = {
    newPage: vi.fn(async () => page),
    addInitScript: vi.fn(async () => {}),
    cookies: vi.fn(async () => []),
    storageState: vi.fn(async () => ({ cookies: [] })),
    pages: vi.fn(() => [page]),
    close: vi.fn(async () => {})
  };
  const browser = {
    newContext: vi.fn(async () => context),
    isConnected: vi.fn(() => true),
    close: vi.fn(async () => {})
  };
  return { page, context, browser };
}

/** 让 refreshExpiredQr 认为「二维码已过期」，并控制刷新按钮是否可见可点。 */
function makeQrExpired(page: ReturnType<typeof makeFakeWorld>['page']) {
  const markerLoc = fakeLocator();
  markerLoc.count.mockResolvedValue(1);
  markerLoc.isVisible.mockResolvedValue(true);
  const refreshBtnLoc = fakeLocator();
  refreshBtnLoc.count.mockResolvedValue(1);
  refreshBtnLoc.isVisible.mockResolvedValue(true);
  page.locator.mockImplementation((selector: string) => {
    if (selector.includes('过期')) return markerLoc;
    if (selector.includes('刷新')) return refreshBtnLoc;
    return fakeLocator();
  });
  return { markerLoc, refreshBtnLoc };
}

describe('session-manager（无头扫码登录）', () => {
  beforeEach(() => {
    vi.mocked(chromium.launch).mockReset();
  });

  afterEach(async () => {
    await sessionManager.cleanupStaleSessions();
  });

  it('createSession 无头启动并返回二维码截图', async () => {
    const world = makeFakeWorld();
    vi.mocked(chromium.launch).mockResolvedValue(
      world.browser as unknown as Browser
    );

    const { sessionId, qrImage } = await sessionManager.createSession('douyin');

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    );
    expect(sessionId).toBeTruthy();
    expect(qrImage).toMatch(/^data:image\/png;base64,/);

    await sessionManager.cancelSession(sessionId);
  });

  it('getSessionStatus 等待扫码时返回最新二维码截图', async () => {
    const world = makeFakeWorld();
    vi.mocked(chromium.launch).mockResolvedValue(
      world.browser as unknown as Browser
    );
    const { sessionId } = await sessionManager.createSession('douyin');

    const status = await sessionManager.getSessionStatus(sessionId);

    expect(status.status).toBe('waiting_scan');
    expect(status.qrImage).toMatch(/^data:image\/png;base64,/);

    await sessionManager.cancelSession(sessionId);
  });

  it('检测到二维码过期时自动点击刷新而不是崩溃', async () => {
    const world = makeFakeWorld();
    vi.mocked(chromium.launch).mockResolvedValue(
      world.browser as unknown as Browser
    );
    const { sessionId } = await sessionManager.createSession('douyin');
    const { refreshBtnLoc } = makeQrExpired(world.page);

    const status = await sessionManager.getSessionStatus(sessionId);

    expect(status.status).toBe('waiting_scan');
    expect(refreshBtnLoc.click).toHaveBeenCalled();
    expect(world.page.reload).not.toHaveBeenCalled();

    await sessionManager.cancelSession(sessionId);
  });

  it('二维码过期且无刷新按钮时整页刷新换新码', async () => {
    const world = makeFakeWorld();
    vi.mocked(chromium.launch).mockResolvedValue(
      world.browser as unknown as Browser
    );
    const { sessionId } = await sessionManager.createSession('douyin');
    makeQrExpired(world.page);
    // 刷新按钮不可见
    world.page.locator.mockImplementation((selector: string) => {
      const loc = fakeLocator();
      if (selector.includes('过期')) {
        loc.count.mockResolvedValue(1);
        loc.isVisible.mockResolvedValue(true);
      }
      return loc;
    });

    const status = await sessionManager.getSessionStatus(sessionId);

    expect(status.status).toBe('waiting_scan');
    expect(world.page.reload).toHaveBeenCalled();

    await sessionManager.cancelSession(sessionId);
  });
});
