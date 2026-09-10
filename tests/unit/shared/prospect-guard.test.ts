import { describe, expect, it } from 'vitest';
import {
  assertCrawlAllowed,
  assertProfileAllowed,
  emptyProspectGuardState,
  estimateCrawlMinutes,
  extractProspectVideoId,
  isCaptchaInterrupt,
  isRecentVideoCrawl,
  normalizeProspectGuardState,
  planCrawlQuota,
  PROSPECT_GUARD,
  scoreAccountHealth
} from '../../../packages/shared/src/prospect-guard';

describe('prospect guard', () => {
  it('resets counters on a new day', () => {
    const next = normalizeProspectGuardState({
      date: '2020-01-01',
      videosCrawled: 60,
      profilesFetched: 20
    });
    expect(next.videosCrawled).toBe(0);
    expect(next.date).toBe(emptyProspectGuardState().date);
  });

  it('blocks crawl when daily video quota is used', () => {
    const state = {
      ...emptyProspectGuardState(),
      videosCrawled: PROSPECT_GUARD.dailyVideoLimit
    };
    expect(() => assertCrawlAllowed(state, 1)).toThrow(/额度已用完/);
  });

  it('blocks profile fetch when last call is too recent', () => {
    const state = {
      ...emptyProspectGuardState(),
      lastProfileAt: new Date().toISOString()
    };
    expect(() => assertProfileAllowed(state)).toThrow(/间隔过短/);
  });

  it('estimates crawl duration from video count', () => {
    expect(estimateCrawlMinutes(5)).toBeGreaterThanOrEqual(1);
  });

  it('trims planned videos to remaining daily quota', () => {
    const plan = planCrawlQuota(10, 30);
    expect(plan.allowedVideos).toBe(10);
    expect(plan.trimmed).toBe(true);
    expect(plan.estimatedMinutes).toBe(estimateCrawlMinutes(10));
  });

  it('does not trim when quota covers the plan', () => {
    const plan = planCrawlQuota(60, 15);
    expect(plan.allowedVideos).toBe(15);
    expect(plan.trimmed).toBe(false);
  });

  it('allows a trimmed crawl when some quota remains', () => {
    const state = {
      ...emptyProspectGuardState(),
      videosCrawled: PROSPECT_GUARD.dailyVideoLimit - 3
    };
    expect(() => assertCrawlAllowed(state, 10)).not.toThrow();
  });

  it('treats a video crawled 6 days ago as recent', () => {
    const crawledAt = new Date('2026-09-01T00:00:00.000Z');
    const now = new Date('2026-09-07T00:00:00.000Z');
    expect(isRecentVideoCrawl(crawledAt, now)).toBe(true);
  });

  it('allows recrawl after the skip window', () => {
    const crawledAt = new Date('2026-08-27T00:00:00.000Z');
    const now = new Date('2026-09-04T00:00:00.000Z');
    expect(isRecentVideoCrawl(crawledAt, now)).toBe(false);
  });

  it('extracts a douyin video id from a watch url', () => {
    expect(
      extractProspectVideoId('https://www.douyin.com/video/7533123456789?from=search')
    ).toBe('7533123456789');
    expect(extractProspectVideoId('7533123456789')).toBe('7533123456789');
    expect(extractProspectVideoId('')).toBeNull();
  });

  it('scores a logged-in account with leftover quota as healthy', () => {
    const health = scoreAccountHealth({
      needsLogin: false,
      captchaWaitMs: 0,
      videosRemaining: 40,
      captchaHitsToday: 0
    });
    expect(health.status).toBe('healthy');
    expect(health.score).toBe(100);
  });

  it('drops health when captcha is cooling', () => {
    const health = scoreAccountHealth({
      needsLogin: false,
      captchaWaitMs: 10 * 60_000,
      videosRemaining: 40,
      captchaHitsToday: 1
    });
    expect(health.status).toBe('cooling');
    expect(health.score).toBeLessThan(50);
  });

  it('treats captcha copy as an interrupt that can be solved in a headed window', () => {
    expect(isCaptchaInterrupt('平台触发了验证码，请在浏览器助手中完成验证')).toBe(
      true
    );
    expect(isCaptchaInterrupt('搜索无结果')).toBe(false);
  });
});
