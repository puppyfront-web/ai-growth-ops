/**
 * Single source of truth for what each platform can actually do.
 *
 * Keep this matrix aligned with docs/delivery/crm-release-status.md. A
 * capability may only be `verified` when a real account has completed the
 * action with external evidence; mock and unit tests are not enough.
 */

export const PLATFORM_CAPABILITY_STATUSES = [
  'verified',
  'beta',
  'unverified',
  'unsupported'
] as const;

export type PlatformCapabilityStatus =
  (typeof PLATFORM_CAPABILITY_STATUSES)[number];

export const PLATFORM_CAPABILITY_STATUS_LABELS: Record<
  PlatformCapabilityStatus,
  string
> = {
  verified: '已验证',
  beta: 'Beta',
  unverified: '未验收',
  unsupported: '不支持'
};

export type PlatformCapability = {
  label: string;
  publish: PlatformCapabilityStatus;
  prospecting: PlatformCapabilityStatus;
  interactionSync: PlatformCapabilityStatus;
  reply: PlatformCapabilityStatus;
  officialApi: PlatformCapabilityStatus;
  note?: string;
};

export const PLATFORM_CAPABILITIES = {
  douyin: {
    label: '抖音',
    publish: 'verified',
    prospecting: 'verified',
    interactionSync: 'beta',
    reply: 'beta',
    officialApi: 'beta',
    note: '发布与关键词获客已验证；自动回复受网页签名风控影响，官方 API 仍需逐账号验收。'
  },
  xiaohongshu: {
    label: '小红书',
    publish: 'beta',
    prospecting: 'beta',
    interactionSync: 'beta',
    reply: 'beta',
    officialApi: 'unsupported',
    note: '浏览器自动化有代码路径；主动获客需显式确认 Beta 风险后使用，发布与互动仍需低量验收。'
  },
  wechat_official: {
    label: '微信公众号',
    publish: 'beta',
    prospecting: 'unsupported',
    interactionSync: 'unverified',
    reply: 'unverified',
    officialApi: 'beta',
    note: '公众号发布与消息能力依赖客户 AppID/服务器配置，尚未完成真实账号验收。'
  },
  wechat_channels: {
    label: '微信视频号',
    publish: 'beta',
    prospecting: 'unsupported',
    interactionSync: 'unverified',
    reply: 'unverified',
    officialApi: 'unsupported',
    note: '以浏览器辅助发布为主，互动承接未验收。'
  },
  baijiahao: {
    label: '百家号',
    publish: 'beta',
    prospecting: 'unsupported',
    interactionSync: 'unverified',
    reply: 'unverified',
    officialApi: 'unsupported',
    note: '浏览器辅助发布路径存在，未完成真实账号验收。'
  },
  zhihu: {
    label: '知乎',
    publish: 'beta',
    prospecting: 'unsupported',
    interactionSync: 'unverified',
    reply: 'unverified',
    officialApi: 'unsupported',
    note: '浏览器辅助发布路径存在，未完成真实账号验收。'
  }
} as const satisfies Record<string, PlatformCapability>;

export type PlatformKey = keyof typeof PLATFORM_CAPABILITIES;

export function getPlatformCapability(platform: PlatformKey): PlatformCapability {
  return { ...PLATFORM_CAPABILITIES[platform] };
}

export function isPlatformVerified(
  platform: PlatformKey,
  capability: 'publish' | 'prospecting' | 'interactionSync' | 'reply'
): boolean {
  return PLATFORM_CAPABILITIES[platform][capability] === 'verified';
}
