/**
 * 平台登录适配器注册表 —— 登录页 URL、登录态检测规则、基线 cookie 白名单、
 * 必备 cookie 的单一事实源。
 *
 * 消费方（派生，不各自维护清单）：
 *   - packages/shared/src/platform-cookie.ts      → validatePlatformCookie 必备字段
 *   - packages/shared/src/browser-authorization.ts → loginUrl / requiredCookieNames
 *   - apps/api/src/browser-login-config.ts        → getLoginUrl
 *   - apps/browser-runner/src/platform-configs.ts  → 登录检测配置构建
 *
 * 本文件只允许纯数据，不引入函数式检测逻辑（Playwright 依赖留在 runner 侧）；
 * 需要手写检测器的平台（当前仅抖音）在 runner 侧以覆盖方式注入。
 *
 * 所有平台共用同一条登录交互链路（与抖音一致）：有显示服务时弹真实浏览器窗口，
 * 操作员在窗口内自行完成登录（扫码或表单均可，成功即写入必备 cookie）；
 * 无显示容器沿用同一套截图 + 远程交互降级。不引入平台专属的自动点击等额外动作。
 *
 * 新平台接入清单（共 3 处）：Prisma Platform 枚举（迁移）、此处一条适配器、
 * Web 展示标签（apps/web types/enums.ts + lib/constants.ts）。
 */

export type PlatformLoginMode = 'qr' | 'form';

export interface PlatformLoginAdapter {
  platform: string;
  loginUrl: string;
  /** qr = 登录页可扫码；form = 仅表单。仅作描述用，交互链路不分平台。 */
  loginMode: PlatformLoginMode;
  /** 登录态候选判定（或语义）；命中后仍须 requiredCookieNames 全部在场才算登录。 */
  detect: {
    /** 候选 cookie 名（大小写不敏感）。禁止收录匿名访问即下发的 cookie（如 xsecappid/ttwid）。 */
    cookieNames?: string[];
    /** 登录后 URL 子串。 */
    urlIncludes?: string[];
  };
  /** 基线兜底只统计这些名字的新增 cookie，避免 SSO/统计 cookie 噪声。 */
  baselineAuthCookieNames?: string[];
  /** 登录成功的必要 cookie：runner finalize 与 API validatePlatformCookie 双侧强校验。 */
  requiredCookieNames: string[];
}

export const PLATFORM_LOGIN_ADAPTERS: Record<string, PlatformLoginAdapter> = {
  douyin: {
    platform: 'douyin',
    loginUrl: 'https://creator.douyin.com/',
    loginMode: 'qr',
    detect: { cookieNames: ['sessionid', 'sid_tt'] },
    baselineAuthCookieNames: ['sessionid', 'sid_tt', 'sid_guard', 'sessionid_ss'],
    requiredCookieNames: ['sessionid']
  },

  // 实测（2026-10-23，spec/29 §1.2）：未登录即有 xsecappid/a1/webId/acw_tc 匿名 cookie，
  // 检测只认 web_session。登录页默认短信表单、扫码需手动切换折角图标——与抖音同一
  // 交互方案：操作员在弹出的真实窗口中自行完成（扫码或短信都会写入 web_session）。
  xiaohongshu: {
    platform: 'xiaohongshu',
    loginUrl: 'https://creator.xiaohongshu.com/login',
    loginMode: 'qr',
    detect: { cookieNames: ['web_session'] },
    baselineAuthCookieNames: ['web_session'],
    requiredCookieNames: ['web_session']
  },

  wechat_official: {
    platform: 'wechat_official',
    loginUrl: 'https://mp.weixin.qq.com/',
    loginMode: 'qr',
    detect: {
      cookieNames: ['slave_user', 'slave_sid', 'bizuin', 'data_bizuin'],
      urlIncludes: ['/cgi-bin/home', '/cgi-bin/index', '/cgi-bin/frame']
    },
    baselineAuthCookieNames: ['slave_sid', 'slave_user'],
    requiredCookieNames: ['slave_sid']
  },

  wechat_channels: {
    platform: 'wechat_channels',
    loginUrl: 'https://channels.weixin.qq.com/',
    loginMode: 'qr',
    detect: {
      cookieNames: ['finder_username', 'userName', 'sessionid', 'wxuin'],
      urlIncludes: ['/platform/', '/post/', '/login_done', '/cgi-bin/']
    },
    baselineAuthCookieNames: ['finder_username', 'userName'],
    requiredCookieNames: ['finder_username']
  },

  baijiahao: {
    platform: 'baijiahao',
    loginUrl: 'https://baijiahao.baidu.com/',
    loginMode: 'form',
    detect: {
      cookieNames: ['BDUSS', 'STOKEN'],
      urlIncludes: ['/builder', '/builder/rc']
    },
    baselineAuthCookieNames: ['BDUSS'],
    requiredCookieNames: ['BDUSS']
  },

  zhihu: {
    platform: 'zhihu',
    loginUrl: 'https://www.zhihu.com/signin',
    loginMode: 'form',
    detect: { cookieNames: ['z_c0', '_zap'], urlIncludes: ['/creator', '/settings'] },
    baselineAuthCookieNames: ['z_c0'],
    requiredCookieNames: ['z_c0']
  }
};

export function getPlatformLoginAdapter(platform: string): PlatformLoginAdapter {
  const adapter = PLATFORM_LOGIN_ADAPTERS[platform];
  if (!adapter) {
    throw new Error(`No platform login adapter for platform: ${platform}`);
  }
  return adapter;
}

export function getPlatformLoginAdapterPlatforms(): string[] {
  return Object.keys(PLATFORM_LOGIN_ADAPTERS);
}

/** 兼容别名：与 platform-cookie.ts 的 REQUIRED_COOKIE_NAMES 语义一致。 */
export function getRequiredCookieNames(platform: string): readonly string[] {
  return getPlatformLoginAdapter(platform).requiredCookieNames;
}
