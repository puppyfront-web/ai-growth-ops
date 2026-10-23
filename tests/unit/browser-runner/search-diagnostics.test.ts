import { describe, expect, it } from 'vitest';
import {
  classifySearchEmptyReason,
  mergeSearchResults
} from '../../../apps/browser-runner/src/assist-routes';

describe('classifySearchEmptyReason', () => {
  it('容器不存在且无登录弹层 → 页面未加载', () => {
    const result = classifySearchEmptyReason({
      containerExists: false,
      loginPromptVisible: false
    });
    expect(result.reasonCode).toBe('SEARCH_PAGE_NOT_LOADED');
    expect(result.message).toContain('搜索页未加载出结果');
  });

  it('登录弹层可见 → 要求登录（优先于容器缺失）', () => {
    const result = classifySearchEmptyReason({
      containerExists: false,
      loginPromptVisible: true
    });
    expect(result.reasonCode).toBe('SEARCH_LOGIN_REQUIRED');
    expect(result.message).toContain('搜索页要求登录');
  });

  it('容器存在且无登录弹层 → 搜索无结果', () => {
    const result = classifySearchEmptyReason({
      containerExists: true,
      loginPromptVisible: false
    });
    expect(result.reasonCode).toBe('SEARCH_EMPTY');
    expect(result.message).toContain('没有匹配结果');
  });

  it('信号缺失时给未知兜底', () => {
    const result = classifySearchEmptyReason({});
    expect(result.reasonCode).toBe('SEARCH_UNKNOWN');
    expect(result.message).toContain('原因未识别');
  });
});

describe('mergeSearchResults', () => {
  const domItem = {
    contentId: '7111111111111111111',
    title: 'dom 视频',
    author: 'dom 作者'
  };
  const apiItem = {
    contentId: '7222222222222222222',
    title: 'api 视频',
    author: 'api 作者',
    awemeType: 2
  };

  it('合并双源并按 contentId 去重（DOM 优先）', () => {
    const merged = mergeSearchResults(
      [domItem, apiItem],
      [apiItem, { ...domItem, title: '同名视频的不同标题' }]
    );
    expect(merged.map((item) => item.contentId)).toEqual([
      domItem.contentId,
      apiItem.contentId
    ]);
    expect(merged[0].title).toBe('dom 视频');
  });

  it('网络有结果而 DOM 为空时取网络结果', () => {
    const merged = mergeSearchResults([], [apiItem]);
    expect(merged).toEqual([apiItem]);
  });

  it('DOM 有结果而网络未命中时取 DOM 结果', () => {
    const merged = mergeSearchResults([domItem], []);
    expect(merged).toEqual([domItem]);
  });

  it('双源皆空返回空数组', () => {
    expect(mergeSearchResults([], [])).toEqual([]);
  });
});
