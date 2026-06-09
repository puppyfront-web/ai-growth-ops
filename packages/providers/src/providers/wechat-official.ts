import type {
  PlatformProvider,
  PlatformAuthConfig,
  HealthCheckResult
} from '../types';

export class WechatOfficialProvider implements PlatformProvider {
  readonly platform = 'wechat_official';
  readonly supportedAuthTypes = ['official_api', 'cookie'] as const;

  async validateCredentials(
    config: PlatformAuthConfig
  ): Promise<HealthCheckResult> {
    // Cookie-based auth (browser QR scan login)
    if (config.cookie) {
      return this.validateCookie(config.cookie);
    }
    // Official API auth
    if (!config.appId || !config.appSecret) {
      return {
        valid: false,
        platform: this.platform,
        error: '缺少 AppID/AppSecret 或 Cookie'
      };
    }
    return this.validateOfficialApi(config.appId, config.appSecret);
  }

  private async validateOfficialApi(
    appId: string,
    appSecret: string
  ): Promise<HealthCheckResult> {
    try {
      const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
        errcode?: number;
        errmsg?: string;
      };
      if (data.access_token) {
        return { valid: true, platform: this.platform };
      }
      return {
        valid: false,
        platform: this.platform,
        error: `微信返回错误: ${data.errmsg ?? `errcode ${data.errcode}`}`
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
      const res = await fetch('https://mp.weixin.qq.com/cgi-bin/home', {
        headers: {
          Cookie: cookie,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });
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
