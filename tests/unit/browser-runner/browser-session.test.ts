import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStealthSession,
  hasDisplaySupport,
  resolveHeadedPreference
} from '../../../apps/browser-runner/src/browser-session';
import { chromium } from 'playwright-extra';

vi.mock('playwright-extra', () => ({
  chromium: { use: vi.fn(), launch: vi.fn() }
}));
vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn(() => ({}))
}));

const ORIGINAL_HEADED = process.env.BROWSER_RUNNER_HEADED;
const ORIGINAL_DISPLAY = process.env.DISPLAY;
const ORIGINAL_WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY;
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')
  ?.value;

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform });
}

function clearDisplayEnv() {
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;
}

function makeFakeBrowser() {
  const context = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    addCookies: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined)
  };
  return {
    newContext: vi.fn().mockResolvedValue(context),
    isConnected: () => true,
    close: vi.fn().mockResolvedValue(undefined)
  };
}

afterEach(async () => {
  if (typeof ORIGINAL_HEADED === 'undefined') {
    delete process.env.BROWSER_RUNNER_HEADED;
  } else {
    process.env.BROWSER_RUNNER_HEADED = ORIGINAL_HEADED;
  }
  if (typeof ORIGINAL_DISPLAY === 'undefined') {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = ORIGINAL_DISPLAY;
  }
  if (typeof ORIGINAL_WAYLAND_DISPLAY === 'undefined') {
    delete process.env.WAYLAND_DISPLAY;
  } else {
    process.env.WAYLAND_DISPLAY = ORIGINAL_WAYLAND_DISPLAY;
  }
  if (typeof ORIGINAL_PLATFORM === 'string') {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM });
  }
  vi.mocked(chromium.launch).mockReset();
});

describe('resolveHeadedPreference', () => {
  it('uses the explicit override when provided', () => {
    process.env.BROWSER_RUNNER_HEADED = 'false';
    expect(resolveHeadedPreference(true)).toBe(true);
    process.env.BROWSER_RUNNER_HEADED = 'true';
    expect(resolveHeadedPreference(false)).toBe(false);
  });

  it('falls back to env when no override is provided', () => {
    process.env.BROWSER_RUNNER_HEADED = 'true';
    expect(resolveHeadedPreference()).toBe(true);
    process.env.BROWSER_RUNNER_HEADED = 'false';
    expect(resolveHeadedPreference()).toBe(false);
  });
});

describe('hasDisplaySupport', () => {
  it('macOS 有窗口服务，无需 DISPLAY', () => {
    setPlatform('darwin');
    clearDisplayEnv();
    expect(hasDisplaySupport()).toBe(true);
  });

  it('Linux 容器（无 DISPLAY/WAYLAND_DISPLAY）没有显示支持', () => {
    setPlatform('linux');
    clearDisplayEnv();
    expect(hasDisplaySupport()).toBe(false);
  });

  it('Linux 配置了 DISPLAY 时有显示支持', () => {
    setPlatform('linux');
    clearDisplayEnv();
    process.env.DISPLAY = ':0';
    expect(hasDisplaySupport()).toBe(true);
  });
});

describe('getSharedBrowser display downgrade', () => {
  it('无显示服务的 Linux 上把 headed 请求降级为 headless 启动', async () => {
    setPlatform('linux');
    clearDisplayEnv();
    process.env.BROWSER_RUNNER_HEADED = 'false';
    const fakeBrowser = makeFakeBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(
      fakeBrowser as unknown as Awaited<ReturnType<typeof chromium.launch>>
    );

    const session = await createStealthSession(
      'sessionid=abc',
      'douyin.com',
      true
    );

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true })
    );
    await session.close();
  });
});
