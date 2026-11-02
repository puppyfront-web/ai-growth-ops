import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isXhsPublishSuccessUrl,
  isXhsUploadCompleteText,
  resolveXhsMedia,
  truncateXhsTitle
} from '../../../apps/browser-runner/src/xhs-publish';

// ── 纯函数（SPEC 37 A1–A4）──────────────────────────────────────

describe('isXhsUploadCompleteText', () => {
  it('命中小红书上传完成关键词', () => {
    for (const text of [
      '上传成功',
      '分辨率 1080P',
      '重新上传',
      '编辑封面',
      '已上传',
      '已选择 3 张图片',
      '上传中 100%'
    ]) {
      expect(isXhsUploadCompleteText(text)).toBe(true);
    }
  });

  it('上传中与空文本不视为完成', () => {
    expect(isXhsUploadCompleteText('上传中 45%')).toBe(false);
    expect(isXhsUploadCompleteText('')).toBe(false);
  });
});

describe('truncateXhsTitle', () => {
  it('空标题保持为空', () => {
    expect(truncateXhsTitle('')).toBe('');
  });

  it('恰 20 字标题不截断', () => {
    const title = '一二三四五六七八九十一二三四五六七八九十';
    expect(title.length).toBe(20);
    expect(truncateXhsTitle(title)).toBe(title);
  });

  it('超长标题截断为 20 字', () => {
    const title = '一二三四五六七八九十一二三四五六七八九十加上尾巴';
    expect(truncateXhsTitle(title)).toBe(
      '一二三四五六七八九十一二三四五六七八九十'
    );
  });
});

describe('isXhsPublishSuccessUrl', () => {
  it('识别发布成功页（含与不含 query）', () => {
    expect(
      isXhsPublishSuccessUrl(
        'https://creator.xiaohongshu.com/publish/success?source=official'
      )
    ).toBe(true);
    expect(
      isXhsPublishSuccessUrl('https://creator.xiaohongshu.com/publish/success')
    ).toBe(true);
  });

  it('编辑页与失败页不视为成功', () => {
    expect(
      isXhsPublishSuccessUrl(
        'https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video'
      )
    ).toBe(false);
    expect(
      isXhsPublishSuccessUrl('https://creator.xiaohongshu.com/login')
    ).toBe(false);
  });
});

describe('resolveXhsMedia', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xhs-publish-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('视频类型：返回存在的视频文件，忽略图片', () => {
    const video = join(dir, 'clip.mp4');
    writeFileSync(video, 'v');
    const result = resolveXhsMedia('video', [video, join(dir, 'a.png')]);
    expect(result).toEqual({ kind: 'video', videoPath: video });
  });

  it('视频类型但文件不存在时报错并说明缺视频素材', () => {
    const result = resolveXhsMedia('video', [join(dir, 'ghost.mp4')]);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toContain('视频');
    }
  });

  it('图文类型：过滤不存在的图片文件', () => {
    const a = join(dir, 'a.png');
    const b = join(dir, 'b.jpg');
    writeFileSync(a, 'a');
    writeFileSync(b, 'b');
    const result = resolveXhsMedia('text_image', [
      a,
      b,
      join(dir, 'ghost.png')
    ]);
    expect(result).toEqual({ kind: 'images', imagePaths: [a, b] });
  });

  it('无任何可用素材时报错并说明需要素材', () => {
    const result = resolveXhsMedia('text_image', []);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error).toContain('素材');
    }
  });
});

// ── 路由分发（SPEC 37 A5）───────────────────────────────────────

async function startTestServer() {
  const { createBrowserRunnerServer } =
    await import('../../../apps/browser-runner/src/server');
  const server = createBrowserRunnerServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe('/assist/publish xiaohongshu 分发', () => {
  it('platform=xiaohongshu 进入专属发布流并透传错误契约', async () => {
    const origSecret = process.env.BROWSER_RUNNER_SECRET;
    const origTokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.BROWSER_RUNNER_SECRET;
    // 密钥缺省时回退到 TOKEN_ENCRYPTION_KEY，需一并清除（同 fetch-messages 测试）
    delete process.env.TOKEN_ENCRYPTION_KEY;

    const errorMessage =
      '小红书登录已失效，请在「集成 → 平台账号」重新扫码登录';
    const publishXiaohongshu = vi
      .fn()
      .mockResolvedValue({ success: false, errorMessage });

    vi.doMock('../../../apps/browser-runner/src/xhs-publish.js', () => ({
      publishXiaohongshu
    }));
    vi.doMock('../../../apps/browser-runner/src/browser-session.js', () => ({
      createStealthSession: vi
        .fn()
        .mockRejectedValue(new Error('session bootstrap failed')),
      createHeadlessSession: vi
        .fn()
        .mockRejectedValue(new Error('session bootstrap failed')),
      createCrawlSession: vi
        .fn()
        .mockRejectedValue(new Error('session bootstrap failed'))
    }));

    const { server, url } = await startTestServer();

    try {
      const response = await fetch(`${url}/assist/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'xiaohongshu',
          cookie: 'web_session=test',
          contentType: 'video',
          title: '测试标题',
          content: '测试正文',
          tags: ['测试'],
          mediaFilePaths: []
        })
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        errorMessage
      });
      expect(publishXiaohongshu).toHaveBeenCalledTimes(1);
      expect(publishXiaohongshu.mock.calls[0][0]).toMatchObject({
        cookie: 'web_session=test',
        contentType: 'video',
        title: '测试标题',
        content: '测试正文',
        tags: ['测试']
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      if (origSecret) process.env.BROWSER_RUNNER_SECRET = origSecret;
      if (origTokenKey) process.env.TOKEN_ENCRYPTION_KEY = origTokenKey;
    }
  });
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
