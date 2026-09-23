import { describe, expect, it } from 'vitest';

import {
  mediaBlockedPlatforms
} from '@/lib/platform-media';

describe('mediaBlockedPlatforms', () => {
  it('does not block article-friendly platforms without media', () => {
    expect(
      mediaBlockedPlatforms(['wechat_official', 'baijiahao', 'zhihu'], 0)
    ).toEqual([]);
  });

  it('blocks pure-text platforms selected without any media', () => {
    expect(
      mediaBlockedPlatforms(
        ['wechat_official', 'douyin', 'xiaohongshu'],
        0
      )
    ).toEqual(['douyin', 'xiaohongshu']);
  });

  it('does not block once any media asset is attached', () => {
    expect(
      mediaBlockedPlatforms(['douyin', 'xiaohongshu', 'wechat_channels'], 1)
    ).toEqual([]);
  });
});
