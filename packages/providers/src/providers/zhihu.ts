import type {
  PlatformProvider,
  PlatformAuthConfig,
  HealthCheckResult
} from '../types';

export class ZhihuProvider implements PlatformProvider {
  readonly platform = 'zhihu';
  readonly supportedAuthTypes = ['cookie'] as const;

  async validateCredentials(
    config: PlatformAuthConfig
  ): Promise<HealthCheckResult> {
    if (!config.cookie) {
      return { valid: false, platform: this.platform, error: '缺少 Cookie' };
    }
    try {
      const res = await fetch('https://www.zhihu.com/creator', {
        headers: {
          Cookie: config.cookie,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });
      if (res.status === 200) return { valid: true, platform: this.platform };
      if (res.status === 302 || res.status === 301) {
        return {
          valid: false,
          platform: this.platform,
          error: 'Cookie 已失效，被重定向到登录页'
        };
      }
      return {
        valid: false,
        platform: this.platform,
        error: `验证失败 (HTTP ${res.status})`
      };
    } catch (err) {
      return {
        valid: false,
        platform: this.platform,
        error: `网络错误: ${(err as Error).message}`
      };
    }
  }
}
