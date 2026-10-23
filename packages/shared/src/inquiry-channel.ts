/**
 * 获客渠道（AcquisitionChannel）的单一事实源与询盘渠道归一化。
 *
 * 注意：这里的 IM 渠道（whatsapp/telegram/…）只是「询盘数据的来源渠道」，
 * 不代表系统在这些平台上具备自动化能力（收发消息等）。
 */
export const ACQUISITION_CHANNELS = [
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu',
  'manual',
  'import',
  'referral',
  'exhibition',
  'phone',
  'website',
  'partner',
  'other',
  'whatsapp',
  'telegram',
  'wechat_personal',
  'email',
  'messenger',
  'instagram',
  'line'
] as const;

export type AcquisitionChannelValue = (typeof ACQUISITION_CHANNELS)[number];

const VALID_CHANNELS = new Set<string>(ACQUISITION_CHANNELS);

/** 询盘渠道别名（trim + 小写后匹配），未命中回退 other。 */
const CHANNEL_ALIASES: Record<string, AcquisitionChannelValue> = {
  wa: 'whatsapp',
  'whats app': 'whatsapp',
  whatsup: 'whatsapp',
  tg: 'telegram',
  电报: 'telegram',
  微信: 'wechat_personal',
  个人微信: 'wechat_personal',
  wechat: 'wechat_personal',
  wx: 'wechat_personal',
  vx: 'wechat_personal',
  'e-mail': 'email',
  mail: 'email',
  邮件: 'email',
  邮箱: 'email',
  电子邮件: 'email',
  'fb messenger': 'messenger',
  'facebook messenger': 'messenger',
  ig: 'instagram',
  ins: 'instagram',
  赖: 'line',
  'line聊天': 'line'
};

export function normalizeInquiryChannel(raw: string): AcquisitionChannelValue {
  const value = raw.trim().toLowerCase();
  if (!value) return 'other';
  if (VALID_CHANNELS.has(value)) return value as AcquisitionChannelValue;
  return CHANNEL_ALIASES[value] ?? 'other';
}
