import { describe, expect, it } from 'vitest';
import {
  douyinPostCommentUrl,
  extractSearchResults,
  parseDouyinContentHref
} from '../../../apps/browser-runner/src/assist-routes.js';

describe('extractSearchResults', () => {
  describe('douyin', () => {
    it('extracts results from standard search response', () => {
      const json = {
        data: {
          list: [
            {
              aweme_info: {
                aweme_id: '7123456789',
                desc: 'AI Agent 开发实战教程',
                author: { nickname: '技术博主A' }
              }
            },
            {
              aweme_info: {
                aweme_id: '7987654321',
                desc: '如何用 AI 提升效率',
                author: { nickname: '效率达人B' }
              }
            }
          ]
        }
      };

      const results = extractSearchResults('douyin', json);
      expect(results).toHaveLength(2);
      expect(results[0].contentId).toBe('7123456789');
      expect(results[0].title).toBe('AI Agent 开发实战教程');
      expect(results[0].author).toBe('技术博主A');
      expect(results[1].contentId).toBe('7987654321');
    });

    it('filters out items without aweme_id', () => {
      const json = {
        data: {
          list: [
            { aweme_info: { aweme_id: '111', desc: 'valid' } },
            { aweme_info: { desc: 'no id' } },
            { aweme_info: { id: '222', desc: 'has id field' } }
          ]
        }
      };

      const results = extractSearchResults('douyin', json);
      expect(results).toHaveLength(2);
      expect(results[0].contentId).toBe('111');
      expect(results[1].contentId).toBe('222');
    });

    it('keeps aweme_type so notes open as /note/ instead of /video/', () => {
      const json = {
        data: {
          list: [
            {
              aweme_info: {
                aweme_id: '7682448472766680354',
                aweme_type: 2,
                desc: '图文笔记'
              }
            }
          ]
        }
      };

      const results = extractSearchResults('douyin', json);
      expect(results[0].awemeType).toBe(2);
      expect(douyinPostCommentUrl(results[0].contentId, results[0].awemeType)).toBe(
        'https://www.douyin.com/note/7682448472766680354'
      );
    });

    it('returns empty for empty list', () => {
      expect(extractSearchResults('douyin', { data: { list: [] } })).toEqual(
        []
      );
    });

    it('handles missing data gracefully', () => {
      expect(extractSearchResults('douyin', {})).toEqual([]);
      expect(extractSearchResults('douyin', { data: {} })).toEqual([]);
    });
  });

  describe('xiaohongshu', () => {
    it('extracts results from search notes response', () => {
      const json = {
        data: {
          items: [
            {
              note_card: {
                note_id: 'note001',
                title: 'AI 工具推荐',
                user: { nickname: '测评小王' }
              }
            },
            {
              note_card: {
                note_id: 'note002',
                title: 'AI 效率提升指南',
                user: { nickname: '效率达人' }
              }
            }
          ]
        }
      };

      const results = extractSearchResults('xiaohongshu', json);
      expect(results).toHaveLength(2);
      expect(results[0].contentId).toBe('note001');
      expect(results[0].title).toBe('AI 工具推荐');
      expect(results[0].author).toBe('测评小王');
    });

    it('filters out items without note_id', () => {
      const json = {
        data: {
          items: [
            { note_card: { note_id: 'note001', title: 'valid' } },
            { note_card: { title: 'no id' } }
          ]
        }
      };

      const results = extractSearchResults('xiaohongshu', json);
      expect(results).toHaveLength(1);
      expect(results[0].contentId).toBe('note001');
    });

    it('falls back to display_title when title is missing', () => {
      const json = {
        data: {
          items: [
            { note_card: { note_id: 'n1', display_title: 'fallback title' } }
          ]
        }
      };

      const results = extractSearchResults('xiaohongshu', json);
      expect(results[0].title).toBe('fallback title');
    });

    it('returns empty for unsupported platform', () => {
      expect(extractSearchResults('unknown', { data: {} })).toEqual([]);
    });
  });
});

describe('parseDouyinContentHref', () => {
  it('distinguishes note and video public URLs', () => {
    expect(
      parseDouyinContentHref('https://www.douyin.com/note/7682448472766680354')
    ).toEqual({
      contentId: '7682448472766680354',
      awemeType: 2
    });
    expect(
      parseDouyinContentHref('https://www.douyin.com/video/7123456789?from=search')
    ).toEqual({ contentId: '7123456789' });
    expect(douyinPostCommentUrl('7123456789')).toBe(
      'https://www.douyin.com/video/7123456789'
    );
  });
});
