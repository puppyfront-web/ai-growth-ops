import { describe, expect, it } from 'vitest';
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_STATUSES,
  getPlatformCapability
} from '../../../packages/shared/src/platform-capabilities';

describe('platform capability matrix', () => {
  it('covers all six supported platforms', () => {
    expect(Object.keys(PLATFORM_CAPABILITIES).sort()).toEqual([
      'baijiahao',
      'douyin',
      'wechat_channels',
      'wechat_official',
      'xiaohongshu',
      'zhihu'
    ]);
  });

  it('marks only verified capabilities as verified', () => {
    expect(PLATFORM_CAPABILITIES.douyin.publish).toBe('verified');
    expect(PLATFORM_CAPABILITIES.douyin.prospecting).toBe('verified');
    expect(PLATFORM_CAPABILITIES.douyin.reply).not.toBe('verified');
    expect(PLATFORM_CAPABILITIES.xiaohongshu.prospecting).not.toBe('verified');
    expect(PLATFORM_CAPABILITIES.zhihu.prospecting).toBe('unsupported');
  });

  it('uses only known status values', () => {
    for (const capabilities of Object.values(PLATFORM_CAPABILITIES)) {
      for (const capability of [
        capabilities.publish,
        capabilities.prospecting,
        capabilities.interactionSync,
        capabilities.reply,
        capabilities.officialApi
      ]) {
        expect(PLATFORM_CAPABILITY_STATUSES).toContain(capability);
      }
    }
  });

  it('explains every non-verified capability', () => {
    for (const capabilities of Object.values(PLATFORM_CAPABILITIES)) {
      const values = [
        capabilities.publish,
        capabilities.prospecting,
        capabilities.interactionSync,
        capabilities.reply,
        capabilities.officialApi
      ];
      if (values.some((value) => value !== 'verified')) {
        expect(capabilities.note?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('returns a defensive copy', () => {
    const first = getPlatformCapability('douyin');
    first.publish = 'unsupported';
    expect(getPlatformCapability('douyin').publish).toBe('verified');
  });
});
