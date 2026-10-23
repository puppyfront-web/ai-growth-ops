import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCrawlSession,
  createStealthSession,
  crawlProfileDirectory,
  hasDisplaySupport,
  resolveHeadedPreference,
  sanitizeCrawlProfileKey
} from '../../../apps/browser-runner/src/browser-session';
import { chromium } from 'playwright-extra';

vi.mock('playwright-extra', () => ({
  chromium: { use: vi.fn(), launch: vi.fn(), launchPersistentContext: vi.fn() }
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
  vi.mocked(chromium.launchPersistentContext).mockReset();
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

describe('sanitizeCrawlProfileKey', () => {
  it('接受平台前缀 + uuid 形式的账号键', () => {
    expect(sanitizeCrawlProfileKey('douyin-0b6b1c1e-8f4d-4f6a-9f1b-1c2d3e4f5a6b'))
      .toBe('douyin-0b6b1c1e-8f4d-4f6a-9f1b-1c2d3e4f5a6b');
  });

  it('拒绝路径穿越、分隔符、空值与超长键', () => {
    expect(sanitizeCrawlProfileKey('../etc')).toBeNull();
    expect(sanitizeCrawlProfileKey('a/b')).toBeNull();
    expect(sanitizeCrawlProfileKey('..')).toBeNull();
    expect(sanitizeCrawlProfileKey('')).toBeNull();
    expect(sanitizeCrawlProfileKey('a'.repeat(65))).toBeNull();
  });
});

describe('crawlProfileDirectory', () => {
  const ORIGINAL_PROFILE_DIR = process.env.BROWSER_RUNNER_PROFILE_DIR;
  const ORIGINAL_LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR;

  afterEach(() => {
    if (typeof ORIGINAL_PROFILE_DIR === 'undefined') {
      delete process.env.BROWSER_RUNNER_PROFILE_DIR;
    } else {
      process.env.BROWSER_RUNNER_PROFILE_DIR = ORIGINAL_PROFILE_DIR;
    }
    if (typeof ORIGINAL_LOCAL_DATA_DIR === 'undefined') {
      delete process.env.LOCAL_DATA_DIR;
    } else {
      process.env.LOCAL_DATA_DIR = ORIGINAL_LOCAL_DATA_DIR;
    }
  });

  it('优先使用 BROWSER_RUNNER_PROFILE_DIR 覆盖', () => {
    process.env.BROWSER_RUNNER_PROFILE_DIR = '/data/profiles';
    expect(crawlProfileDirectory('douyin-abc123')).toBe(
      '/data/profiles/douyin-abc123'
    );
  });

  it('默认落在 LOCAL_DATA_DIR/browser-profiles 下', () => {
    delete process.env.BROWSER_RUNNER_PROFILE_DIR;
    process.env.LOCAL_DATA_DIR = '/var/lib/ai-growth-ops';
    expect(crawlProfileDirectory('douyin-abc123')).toBe(
      '/var/lib/ai-growth-ops/browser-profiles/douyin-abc123'
    );
  });
});

describe('createCrawlSession routing', () => {
  it('传 profileKey 时走 launchPersistentContext 且 userDataDir 含该键', async () => {
    setPlatform('linux');
    clearDisplayEnv();
    process.env.BROWSER_RUNNER_PROFILE_DIR = '/data/profiles';
    const fakeContext = {
      addInitScript: vi.fn().mockResolvedValue(undefined),
      addCookies: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([]),
      newPage: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
      close: vi.fn().mockResolvedValue(undefined)
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue(
      fakeContext as unknown as Awaited<
        ReturnType<typeof chromium.launchPersistentContext>
      >
    );

    const session = await createCrawlSession(
      'sessionid=abc',
      'douyin.com',
      false,
      'douyin-abc123'
    );
    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      '/data/profiles/douyin-abc123',
      expect.objectContaining({ headless: true })
    );
    await session.close();
    // close 只关 page，持久 context 保持存活供下次复用
    expect(fakeContext.close).not.toHaveBeenCalled();
  });

  it('不传 profileKey 时回退共享浏览器一次性 context', async () => {
    setPlatform('linux');
    clearDisplayEnv();
    const fakeBrowser = makeFakeBrowser();
    vi.mocked(chromium.launch).mockResolvedValue(
      fakeBrowser as unknown as Awaited<ReturnType<typeof chromium.launch>>
    );

    const session = await createCrawlSession('sessionid=abc', 'douyin.com');
    // 共享浏览器可能已被同文件更早的测试缓存，断言重点是持久分支未被触发
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(session.page).toBeDefined();
    await session.close();
  });
});
