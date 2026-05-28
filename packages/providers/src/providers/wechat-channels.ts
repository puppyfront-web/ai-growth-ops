import type { PlatformProvider, PlatformAuthConfig, HealthCheckResult } from '../types';

export class WechatChannelsProvider implements PlatformProvider {
  readonly platform = 'wechat_channels';
  readonly supportedAuthTypes = ['cookie', 'official_api'] as const;

  async validateCredentials(config: PlatformAuthConfig): Promise<HealthCheckResult> {
    if (config.authType === 'official_api' && config.appId && config.appSecret) {
      try {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await res.json() as { access_token?: string; errcode?: number; errmsg?: string };
        if (data.access_token) return { valid: true, platform: this.platform };
        return { valid: false, platform: this.platform, error: `微信返回错误: ${data.errmsg ?? `errcode ${data.errcode}`}` };
      } catch (err) {
        return { valid: false, platform: this.platform, error: `网络错误: ${(err as Error).message}` };
      }
    }

    if (config.cookie) {
      try {
        const res = await fetch('https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data', {
          headers: { 'Cookie': config.cookie },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return { valid: true, platform: this.platform };
        return { valid: false, platform: this.platform, error: `Cookie 验证失败 (HTTP ${res.status})` };
      } catch (err) {
        return { valid: false, platform: this.platform, error: `网络错误: ${(err as Error).message}` };
      }
    }

    return { valid: false, platform: this.platform, error: '缺少 Cookie 或 AppID/AppSecret' };
  }
}
