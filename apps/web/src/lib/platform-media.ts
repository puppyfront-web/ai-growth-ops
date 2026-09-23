import type { Platform } from '@/types/enums';

// 这些平台的创作者后台不支持纯文字发布（抖音发布器会直接拒绝无素材内容，
// 小红书/视频号由平台侧强制要求），发布前必须至少关联一个素材
const PLATFORMS_REQUIRING_MEDIA = new Set<string>([
  'douyin',
  'xiaohongshu',
  'wechat_channels'
]);

/**
 * 返回已选中但内容没有素材、无法发布的平台列表。
 * 内容已关联素材时返回空数组（有任意图/视频素材即可满足要求）。
 */
export function mediaBlockedPlatforms(
  selected: Iterable<string>,
  mediaCount: number
): Platform[] {
  if (mediaCount > 0) return [];
  return [...selected].filter((platform) =>
    PLATFORMS_REQUIRING_MEDIA.has(platform)
  ) as Platform[];
}
