import type {
  PlatformProvider,
  PlatformAuthConfig,
  HealthCheckResult
} from '../types';

export class DouyinProvider implements PlatformProvider {
  readonly platform = 'douyin';
  readonly supportedAuthTypes = ['oauth', 'official_api', 'cookie'] as const;

  async validateCredentials(
    config: PlatformAuthConfig
  ): Promise<HealthCheckResult> {
    // Cookie-based auth (browser login)
    if (config.cookie) {
      return this.validateCookie(config.cookie);
    }
    // OAuth / official API auth
    if (!config.accessToken) {
      return {
        valid: false,
        platform: this.platform,
        error: '缺少 Access Token 或 Cookie'
      };
    }
    return this.validateAccessToken(config.accessToken);
  }

  private async validateAccessToken(
    accessToken: string
  ): Promise<HealthCheckResult> {
    try {
      const res = await fetch('https://open.douyin.com/oauth/userinfo/', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        return { valid: true, platform: this.platform };
      }
      if (res.status === 401) {
        return {
          valid: false,
          platform: this.platform,
          error: 'Token 已过期或无效 (401)'
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

  private async validateCookie(cookie: string): Promise<HealthCheckResult> {
    try {
      const res = await fetch(
        'https://creator.douyin.com/aweme/v1/creator/data/billboard/',
        {
          headers: {
            Cookie: cookie,
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Referer: 'https://creator.douyin.com/'
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(10000)
        }
      );
      if (res.status === 200) {
        return { valid: true, platform: this.platform };
      }
      if (res.status === 302 || res.status === 301) {
        return {
          valid: false,
          platform: this.platform,
          error: 'Cookie 已失效，被重定向到登录页'
        };
      }
      if (res.status === 401) {
        return {
          valid: false,
          platform: this.platform,
          error: 'Cookie 已过期 (401)'
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
