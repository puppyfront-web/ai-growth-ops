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

const PLATFORM_AUTHORIZATION_ADAPTERS: Record<
  string,
  PlatformAuthorizationAdapter
> = {
  douyin: {
    platform: 'douyin',
    loginUrl: 'https://creator.douyin.com/',
    allowedOrigins: ['https://douyin.com'],
    cookieDomains: ['douyin.com'],
    requiredCookieNames: ['sessionid'],
    cookieNames: [
      'sessionid',
      'sid_tt',
      'sessionid_ss',
      'sid_guard',
      'csrf_session_id',
      'passport_csrf_token',
      'ttwid'
    ]
  },
  xiaohongshu: {
    platform: 'xiaohongshu',
    loginUrl: 'https://creator.xiaohongshu.com/login',
    allowedOrigins: ['https://xiaohongshu.com'],
    cookieDomains: ['xiaohongshu.com'],
    requiredCookieNames: ['web_session'],
    cookieNames: ['web_session', 'webId', 'a1', 'webBuild', 'acw_tc']
  },
  wechat_official: {
    platform: 'wechat_official',
    loginUrl: 'https://mp.weixin.qq.com/',
    allowedOrigins: ['https://qq.com'],
    cookieDomains: ['qq.com'],
    requiredCookieNames: ['slave_sid'],
    cookieNames: [
      'slave_sid',
      'slave_user',
      'bizuin',
      'data_bizuin',
      'data_ticket',
      'xid'
    ]
  },
  wechat_channels: {
    platform: 'wechat_channels',
    loginUrl: 'https://channels.weixin.qq.com/',
    allowedOrigins: ['https://weixin.qq.com'],
    cookieDomains: ['weixin.qq.com'],
    requiredCookieNames: ['finder_username'],
    cookieNames: ['finder_username', 'wxuin', 'wxsid']
  },
  baijiahao: {
    platform: 'baijiahao',
    loginUrl: 'https://baijiahao.baidu.com/',
    allowedOrigins: ['https://baidu.com'],
    cookieDomains: ['baidu.com'],
    requiredCookieNames: ['BDUSS'],
    cookieNames: ['BDUSS', 'STOKEN']
  },
  zhihu: {
    platform: 'zhihu',
    loginUrl: 'https://www.zhihu.com/signin',
    allowedOrigins: ['https://zhihu.com'],
    cookieDomains: ['zhihu.com'],
    requiredCookieNames: ['z_c0'],
    cookieNames: ['z_c0', '_xsrf', 'd_c0']
  }
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
