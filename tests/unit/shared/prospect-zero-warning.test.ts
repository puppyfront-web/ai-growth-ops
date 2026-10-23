import { describe, expect, it } from 'vitest';
import { buildZeroResultWarning } from '../../../packages/shared/src/prospect-warning';

describe('buildZeroResultWarning', () => {
  it('搜索页未加载时给出页面级原因与下一步，不再断言 Cookie 失效', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_PAGE_NOT_LOADED']
    });
    expect(warning).toContain('搜索页未加载出结果');
    expect(warning).toContain('重试');
    expect(warning).not.toContain('Cookie 失效');
  });

  it('搜索页要求登录时提示重新扫码授权', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_LOGIN_REQUIRED']
    });
    expect(warning).toContain('搜索页要求登录');
    expect(warning).toContain('扫码');
    expect(warning).not.toContain('Cookie 失效');
  });

  it('仅搜索无结果时提示调整关键词', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_EMPTY']
    });
    expect(warning).toContain('无结果');
    expect(warning).toContain('关键词');
  });

  it('搜索有结果但全被去重跳过时提示强制重抓', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_ALL_SKIPPED']
    });
    expect(warning).toContain('近期已抓取');
    expect(warning).toContain('强制重抓');
    expect(warning).not.toContain('Cookie 失效');
  });

  it('未识别原因时保留旧的 Cookie 兜底文案', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_UNKNOWN']
    });
    expect(warning).toBe(
      '未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行'
    );
  });

  it('旧版 runner 未返回原因时同样保留旧文案', () => {
    expect(
      buildZeroResultWarning({
        totalComments: 0,
        totalCandidates: 0,
        skippedDuplicates: 0
      })
    ).toBe(
      '未抓取到评论，可能是 Cookie 失效、触发验证码或搜索无结果，请检查抖音登录后重新执行'
    );
  });

  it('多种原因并存时优先报告页面未加载', () => {
    const warning = buildZeroResultWarning({
      totalComments: 0,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: ['SEARCH_EMPTY', 'SEARCH_PAGE_NOT_LOADED']
    });
    expect(warning).toContain('搜索页未加载出结果');
  });

  it('已抓到评论但无达标潜客时提示调低阈值', () => {
    const warning = buildZeroResultWarning({
      totalComments: 12,
      totalCandidates: 0,
      skippedDuplicates: 0,
      searchEmptyReasons: []
    });
    expect(warning).toContain('已抓取评论但未找到达到阈值的潜客');
  });

  it('有跳过的重复潜客时不产生零结果警告', () => {
    expect(
      buildZeroResultWarning({
        totalComments: 0,
        totalCandidates: 0,
        skippedDuplicates: 3
      })
    ).toBeUndefined();
  });

  it('已有潜客时不产生零结果警告', () => {
    expect(
      buildZeroResultWarning({
        totalComments: 5,
        totalCandidates: 2,
        skippedDuplicates: 0
      })
    ).toBeUndefined();
  });
});
