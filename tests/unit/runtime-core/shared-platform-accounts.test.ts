import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultPublishRegistry, buildPublishInvocation } from '../../../apps/runtime-core/src/tools/publish-tools';
import { runInteractionOps } from '../../../apps/runtime-core/src/workflows/run-interaction-ops';
import {
  resolveCookieForPlatform,
  resolveSharedAccountForPlatform,
} from '../../../apps/runtime-core/src/tools/credential-tools';

const originalEnv = {
  AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT,
  AI_GROWTH_OPS_KUAISHOU_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_KUAISHOU_SHARED_ACCOUNT,
  AI_GROWTH_OPS_WECHAT_CHANNELS_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_WECHAT_CHANNELS_SHARED_ACCOUNT,
  AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT,
  AI_GROWTH_OPS_WECHAT_OFFICIAL_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_WECHAT_OFFICIAL_SHARED_ACCOUNT,
  AI_GROWTH_OPS_ZHIHU_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_ZHIHU_SHARED_ACCOUNT,
  AI_GROWTH_OPS_BAIJIAHAO_SHARED_ACCOUNT: process.env.AI_GROWTH_OPS_BAIJIAHAO_SHARED_ACCOUNT,
  SOCIAL_PUBLISH_DATA_DIR: process.env.SOCIAL_PUBLISH_DATA_DIR,
  AI_GROWTH_OPS_SOCIAL_PUBLISH_ROOT: process.env.AI_GROWTH_OPS_SOCIAL_PUBLISH_ROOT,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('shared platform account fallback', () => {
  it('reuses the shared douyin publish cookie for interaction fetches', async () => {
    const tempRoot = join(process.cwd(), '.tmp-tests', `douyin-cookie-${Date.now()}`);
    await mkdir(join(tempRoot, 'cookies', 'douyin'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'douyin', 'shared.json'),
      JSON.stringify({
        cookies: [
          { name: 'sessionid', value: 'shared-session' },
          { name: 'sid_tt', value: 'shared-sid-tt' },
        ],
      }),
      'utf8',
    );

    process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT = 'shared';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;

    const result = await runInteractionOps({
      platform: 'douyin',
      interactionType: 'comments',
    });

    expect(result.status).toBe('success');
    expect(result.mode).toBe('fallback');
    expect(result.reason).toBe('browser_runner_unavailable');
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('uses the shared douyin account name for publish invocations when account is omitted', async () => {
    process.env.AI_GROWTH_OPS_DOUYIN_SHARED_ACCOUNT = 'shared';
    const registry = await createDefaultPublishRegistry();
    const manifest = registry.resolve('publish.video', { platform: 'douyin' });

    expect(manifest).toBeTruthy();
    const invocation = buildPublishInvocation(
      manifest!,
      {
        platform: 'douyin',
        account: resolveSharedAccountForPlatform('douyin'),
        title: 'Shared Account Publish',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4'],
      },
      '/tmp/social-publish-root',
    );

    expect(invocation.payload).toMatchObject({
      root: '/tmp/social-publish-root',
      cliRelativePath: 'dist/cli.js',
      command: [
        'douyin',
        'upload',
        '--account',
        'shared',
        '--file',
        '/tmp/demo.mp4',
        '--title',
        'Shared Account Publish',
      ],
    });
  });

  it('uses the shared kuaishou account name for publish invocations when account is omitted', async () => {
    process.env.AI_GROWTH_OPS_KUAISHOU_SHARED_ACCOUNT = 'shared-kuaishou';
    const registry = await createDefaultPublishRegistry();
    const manifest = registry.resolve('publish.video', { platform: 'kuaishou' });

    expect(manifest).toBeTruthy();
    const invocation = buildPublishInvocation(
      manifest!,
      {
        platform: 'kuaishou',
        account: resolveSharedAccountForPlatform('kuaishou'),
        title: 'Shared Kuaishou Publish',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4'],
      },
      '/tmp/social-publish-root',
    );

    expect(invocation.payload).toMatchObject({
      root: '/tmp/social-publish-root',
      cliRelativePath: 'dist/cli.js',
      command: [
        'kuaishou',
        'upload',
        '--account',
        'shared-kuaishou',
        '--file',
        '/tmp/demo.mp4',
        '--title',
        'Shared Kuaishou Publish',
      ],
    });
  });

  it('uses the shared wechat channels account name for publish invocations when account is omitted', async () => {
    process.env.AI_GROWTH_OPS_WECHAT_CHANNELS_SHARED_ACCOUNT = 'shared-channels';
    const registry = await createDefaultPublishRegistry();
    const manifest = registry.resolve('publish.video', { platform: 'wechat_channels' });

    expect(manifest).toBeTruthy();
    const invocation = buildPublishInvocation(
      manifest!,
      {
        platform: 'wechat_channels',
        account: resolveSharedAccountForPlatform('wechat_channels'),
        title: 'Shared Wechat Channels Publish',
        content: 'hello',
        mediaFilePaths: ['/tmp/demo.mp4'],
      },
      '/tmp/social-publish-root',
    );

    expect(invocation.payload).toMatchObject({
      root: '/tmp/social-publish-root',
      cliRelativePath: 'dist/cli.js',
      command: [
        'tencent',
        'upload',
        '--account',
        'shared-channels',
        '--file',
        '/tmp/demo.mp4',
        '--title',
        'Shared Wechat Channels Publish',
      ],
    });
  });

  it('reuses the shared xiaohongshu publish cookie from the local storage-state file', async () => {
    const tempRoot = join(process.cwd(), '.tmp-tests', `xiaohongshu-cookie-${Date.now()}`);
    await mkdir(join(tempRoot, 'cookies', 'xiaohongshu'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'xiaohongshu', 'shared-xhs.json'),
      JSON.stringify({
        cookies: [
          { name: 'web_session', value: 'xhs-session' },
          { name: 'a1', value: 'xhs-a1' },
        ],
      }),
      'utf8',
    );

    process.env.AI_GROWTH_OPS_XIAOHONGSHU_SHARED_ACCOUNT = 'shared-xhs';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;

    const cookie = await resolveCookieForPlatform('xiaohongshu');
    expect(cookie).toBe('web_session=xhs-session; a1=xhs-a1');
  });

  it('reuses the shared wechat official publish cookie from the local storage-state file', async () => {
    const tempRoot = join(process.cwd(), '.tmp-tests', `wechatmp-cookie-${Date.now()}`);
    await mkdir(join(tempRoot, 'cookies', 'wechatmp'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'wechatmp', 'shared-mp.json'),
      JSON.stringify({
        cookies: [
          { name: 'pass_ticket', value: 'mp-ticket' },
          { name: 'wap_sid2', value: 'mp-sid' },
        ],
      }),
      'utf8',
    );

    process.env.AI_GROWTH_OPS_WECHAT_OFFICIAL_SHARED_ACCOUNT = 'shared-mp';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;

    const cookie = await resolveCookieForPlatform('wechat_official');
    expect(cookie).toBe('pass_ticket=mp-ticket; wap_sid2=mp-sid');
  });

  it('reuses the shared zhihu publish cookie from the local storage-state file', async () => {
    const tempRoot = join(process.cwd(), '.tmp-tests', `zhihu-cookie-${Date.now()}`);
    await mkdir(join(tempRoot, 'cookies', 'zhihu'), { recursive: true });
    await writeFile(
      join(tempRoot, 'cookies', 'zhihu', 'shared-zhihu.json'),
      JSON.stringify({
        cookies: [
          { name: 'z_c0', value: 'zhihu-token' },
          { name: '_zap', value: 'zhihu-zap' },
        ],
      }),
      'utf8',
    );

    process.env.AI_GROWTH_OPS_ZHIHU_SHARED_ACCOUNT = 'shared-zhihu';
    process.env.SOCIAL_PUBLISH_DATA_DIR = tempRoot;

    const cookie = await resolveCookieForPlatform('zhihu');
    expect(cookie).toBe('z_c0=zhihu-token; _zap=zhihu-zap');
  });
});
