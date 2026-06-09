const loginUrls: Record<string, string> = {
  douyin: 'https://creator.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/login',
  wechat_official: 'https://mp.weixin.qq.com/',
  wechat_channels: 'https://channels.weixin.qq.com/',
  baijiahao: 'https://baijiahao.baidu.com/',
  zhihu: 'https://www.zhihu.com/signin',
};

export function getLoginUrl(platform: string): string {
  const url = loginUrls[platform];
  if (!url) throw new Error(`No login URL for platform: ${platform}`);
  return url;
}

export function getBrowserRunnerUrl(): string {
  return process.env.BROWSER_RUNNER_URL ?? 'http://localhost:3200';
}

/**
 * Fetch with AbortController timeout so stalled connections to browser-runner don't hang.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
