import { getPlatformLoginAdapter } from './platform-login';

export type BrowserAuthorizationStatus =
  | 'waiting_local_bridge'
  | 'waiting_user'
  | 'logged_in'
  | 'cancelled'
  | 'expired'
  | 'error';

export interface PlatformAuthorizationAdapter {
  platform: string;
  loginUrl: string;
  allowedOrigins: readonly string[];
  cookieDomains: readonly string[];
  requiredCookieNames: readonly string[];
  cookieNames: readonly string[];
}

export interface AuthorizationCookie {
  name: string;
  value: string;
  domain: string;
}

/** loginUrl / requiredCookieNames 派生自 platform-login 注册表（单一事实源），
 *  此处只维护 Browser Bridge 专有字段（来源白名单、cookie 域与采集白名单）。 */
function defineAuthorizationAdapter(
  platform: string,
  bridge: Pick<
    PlatformAuthorizationAdapter,
    'allowedOrigins' | 'cookieDomains' | 'cookieNames'
  >
): PlatformAuthorizationAdapter {
  const login = getPlatformLoginAdapter(platform);
  return {
    platform,
    loginUrl: login.loginUrl,
    requiredCookieNames: login.requiredCookieNames,
    ...bridge
  };
}

const PLATFORM_AUTHORIZATION_ADAPTERS: Record<
  string,
  PlatformAuthorizationAdapter
> = {
  douyin: defineAuthorizationAdapter('douyin', {
    allowedOrigins: ['https://douyin.com'],
    cookieDomains: ['douyin.com'],
    cookieNames: [
      'sessionid',
      'sid_tt',
      'sessionid_ss',
      'sid_guard',
      'csrf_session_id',
      'passport_csrf_token',
      'ttwid'
    ]
  }),
  xiaohongshu: defineAuthorizationAdapter('xiaohongshu', {
    allowedOrigins: ['https://xiaohongshu.com'],
    cookieDomains: ['xiaohongshu.com'],
    cookieNames: ['web_session', 'webId', 'a1', 'webBuild', 'acw_tc']
  }),
  wechat_official: defineAuthorizationAdapter('wechat_official', {
    allowedOrigins: ['https://qq.com'],
    cookieDomains: ['qq.com'],
    cookieNames: [
      'slave_sid',
      'slave_user',
      'bizuin',
      'data_bizuin',
      'data_ticket',
      'xid'
    ]
  }),
  wechat_channels: defineAuthorizationAdapter('wechat_channels', {
    allowedOrigins: ['https://weixin.qq.com'],
    cookieDomains: ['weixin.qq.com'],
    cookieNames: ['finder_username', 'wxuin', 'wxsid']
  }),
  baijiahao: defineAuthorizationAdapter('baijiahao', {
    allowedOrigins: ['https://baidu.com'],
    cookieDomains: ['baidu.com'],
    cookieNames: ['BDUSS', 'STOKEN']
  }),
  zhihu: defineAuthorizationAdapter('zhihu', {
    allowedOrigins: ['https://zhihu.com'],
    cookieDomains: ['zhihu.com'],
    cookieNames: ['z_c0', '_xsrf', 'd_c0']
  })
};

const STATUS_TRANSITIONS: Record<
  BrowserAuthorizationStatus,
  readonly BrowserAuthorizationStatus[]
> = {
  waiting_local_bridge: ['waiting_user', 'cancelled', 'expired', 'error'],
  waiting_user: ['logged_in', 'cancelled', 'expired', 'error'],
  logged_in: [],
  cancelled: [],
  expired: [],
  error: []
};

export function getPlatformAuthorizationAdapter(
  platform: string
): PlatformAuthorizationAdapter {
  const adapter = PLATFORM_AUTHORIZATION_ADAPTERS[platform];
  if (!adapter) {
    throw new Error(`Unsupported browser authorization platform: ${platform}`);
  }
  return adapter;
}

function sanitizeProfileSegment(value: string): string {
  return value
    .split(/[\\/]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .at(-1) ?? 'unknown';
}

export function createBrowserProfileRef(
  platform: string,
  platformAccountId: string
): string {
  return `${sanitizeProfileSegment(platform)}/${sanitizeProfileSegment(platformAccountId)}`;
}

function domainMatches(cookieDomain: string, allowedDomain: string): boolean {
  const normalizedCookieDomain = cookieDomain.toLowerCase().replace(/^\./, '');
  const normalizedAllowedDomain = allowedDomain.toLowerCase().replace(/^\./, '');
  return (
    normalizedCookieDomain === normalizedAllowedDomain ||
    normalizedCookieDomain.endsWith(`.${normalizedAllowedDomain}`)
  );
}

export function filterAuthorizationCookies(
  adapter: PlatformAuthorizationAdapter,
  cookies: readonly AuthorizationCookie[]
): string {
  const allowedNames = new Set(adapter.cookieNames);
  const selected = cookies.filter(
    (cookie) =>
      allowedNames.has(cookie.name) &&
      adapter.cookieDomains.some((domain) => domainMatches(cookie.domain, domain))
  );
  const presentNames = new Set(selected.map((cookie) => cookie.name));
  if (
    adapter.requiredCookieNames.some((cookieName) => !presentNames.has(cookieName))
  ) {
    return '';
  }
  return selected.map(({ name, value }) => `${name}=${value}`).join('; ');
}

export function canTransitionBrowserAuthorizationStatus(
  from: BrowserAuthorizationStatus,
  to: BrowserAuthorizationStatus
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}
