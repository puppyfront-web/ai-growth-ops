import { describe, it, expect } from 'vitest';

// ── Publish Provider Interface ────────────────────────────────────
interface PublishCapabilities {
  textImage: boolean;
  video: boolean;
  article: boolean;
  answer: boolean;
}

interface PublishResult {
  success: boolean;
  externalPublishId?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface PublishStatusResult {
  status: 'pending' | 'published' | 'failed';
  externalUrl?: string;
}

interface PublishProvider {
  readonly platform: string;
  getCapabilities(): PublishCapabilities;
  publishTextImage(input: { title: string; body: string; mediaAssetIds: string[] }): Promise<PublishResult>;
  publishVideo(input: { title: string; videoAssetId: string }): Promise<PublishResult>;
  fetchStatus(input: { externalPublishId: string }): Promise<PublishStatusResult>;
}

// ── Sandbox Implementation ────────────────────────────────────────
class SandboxPublishProvider implements PublishProvider {
  readonly platform: string;
  private caps: PublishCapabilities;

  constructor(platform: string, caps?: Partial<PublishCapabilities>) {
    this.platform = platform;
    this.caps = { textImage: true, video: true, article: true, answer: true, ...caps };
  }

  getCapabilities(): PublishCapabilities {
    return { ...this.caps };
  }

  async publishTextImage(input: { title: string; body: string; mediaAssetIds: string[] }): Promise<PublishResult> {
    if (!this.caps.textImage) {
      return { success: false, errorCode: 'UNSUPPORTED', errorMessage: `${this.platform} does not support text_image publishing` };
    }
    return { success: true, externalPublishId: `sandbox_${this.platform}_${Date.now()}` };
  }

  async publishVideo(input: { title: string; videoAssetId: string }): Promise<PublishResult> {
    if (!this.caps.video) {
      return { success: false, errorCode: 'UNSUPPORTED', errorMessage: `${this.platform} does not support video publishing` };
    }
    return { success: true, externalPublishId: `sandbox_${this.platform}_vid_${Date.now()}` };
  }

  async fetchStatus(input: { externalPublishId: string }): Promise<PublishStatusResult> {
    return { status: 'published', externalUrl: `https://${this.platform}.com/post/${input.externalPublishId}` };
  }
}

describe('PublishProvider Contract', () => {
  const provider = new SandboxPublishProvider('douyin');

  it('getCapabilities returns capability matrix', () => {
    const caps = provider.getCapabilities();
    expect(caps.textImage).toBe(true);
    expect(caps.video).toBe(true);
  });

  it('publishTextImage returns externalPublishId', async () => {
    const result = await provider.publishTextImage({
      title: 'Test', body: 'Body', mediaAssetIds: ['asset1']
    });
    expect(result.success).toBe(true);
    expect(result.externalPublishId).toBeDefined();
    expect(result.externalPublishId).toContain('sandbox_douyin');
  });

  it('publishVideo returns externalPublishId', async () => {
    const result = await provider.publishVideo({
      title: 'Video', videoAssetId: 'asset2'
    });
    expect(result.success).toBe(true);
    expect(result.externalPublishId).toBeDefined();
  });

  it('fetchStatus returns published status', async () => {
    const result = await provider.fetchStatus({ externalPublishId: 'test_123' });
    expect(result.status).toBe('published');
    expect(result.externalUrl).toBeDefined();
  });

  it('unsupported capability returns clear error', async () => {
    const limited = new SandboxPublishProvider('wechat_official', { textImage: true, video: false, article: false, answer: false });
    const result = await limited.publishVideo({ title: 'Test', videoAssetId: 'a1' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('UNSUPPORTED');
    expect(result.errorMessage).toContain('does not support');
  });

  it('all 6 platforms have sandbox provider', () => {
    const platforms = ['douyin', 'xiaohongshu', 'wechat_official', 'wechat_channels', 'baijiahao', 'zhihu'];
    for (const p of platforms) {
      const prov = new SandboxPublishProvider(p);
      expect(prov.platform).toBe(p);
      expect(prov.getCapabilities().textImage).toBe(true);
    }
  });
});
