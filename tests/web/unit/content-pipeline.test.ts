import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateContentWithMedia,
  generatePlatformVariants,
  checkContentCompliance,
  runAiContentPipeline
} from '@/lib/api/content';

vi.mock('@/lib/api/client', () => ({
  apiPost: vi.fn()
}));

import { apiPost } from '@/lib/api/client';

const mockApiPost = vi.mocked(apiPost);

describe('content API pipeline', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
  });

  it('runAiContentPipeline chains generate, variants, and compliance', async () => {
    const contentItem = { id: 'item-1', title: 'Test', type: 'text_image' };
    const variants = [{ id: 'v-1', platform: 'douyin' }];
    const compliance = { passed: true, riskLevel: 'low', aiChecked: true };

    mockApiPost
      .mockResolvedValueOnce({ contentItem, mediaAssets: [], skillOutput: {} })
      .mockResolvedValueOnce(variants)
      .mockResolvedValueOnce(compliance);

    const result = await runAiContentPipeline({
      topic: '夏季风扇选购',
      contentType: 'text_image',
      platforms: ['douyin', 'xiaohongshu']
    });

    expect(result.contentItem).toEqual(contentItem);
    expect(result.variants).toEqual(variants);
    expect(result.compliance).toEqual(compliance);
    expect(mockApiPost).toHaveBeenCalledTimes(3);
    expect(mockApiPost).toHaveBeenNthCalledWith(
      1,
      '/api/content-items/generate-with-media',
      expect.objectContaining({ topic: '夏季风扇选购' })
    );
    expect(mockApiPost).toHaveBeenNthCalledWith(
      2,
      '/api/content-items/item-1/generate-variants',
      { platforms: ['douyin', 'xiaohongshu'] }
    );
    expect(mockApiPost).toHaveBeenNthCalledWith(
      3,
      '/api/content-items/item-1/compliance-check'
    );
  });

  it('generateContentWithMedia posts to correct endpoint', async () => {
    mockApiPost.mockResolvedValueOnce({ contentItem: { id: 'x' } });
    await generateContentWithMedia({ topic: 'hello' });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/content-items/generate-with-media',
      { topic: 'hello' }
    );
  });

  it('checkContentCompliance posts to correct endpoint', async () => {
    mockApiPost.mockResolvedValueOnce({ passed: true });
    await checkContentCompliance('abc');
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/content-items/abc/compliance-check'
    );
  });
});
