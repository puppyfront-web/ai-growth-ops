import type { PlatformProvider } from './types';
import { DouyinProvider } from './providers/douyin';
import { XiaohongshuProvider } from './providers/xiaohongshu';
import { WechatOfficialProvider } from './providers/wechat-official';
import { WechatChannelsProvider } from './providers/wechat-channels';
import { BaijiahaoProvider } from './providers/baijiahao';
import { ZhihuProvider } from './providers/zhihu';

const providers = new Map<string, PlatformProvider>([
  ['douyin', new DouyinProvider()],
  ['xiaohongshu', new XiaohongshuProvider()],
  ['wechat_official', new WechatOfficialProvider()],
  ['wechat_channels', new WechatChannelsProvider()],
  ['baijiahao', new BaijiahaoProvider()],
  ['zhihu', new ZhihuProvider()]
]);

export function getPlatformProvider(platform: string): PlatformProvider {
  const provider = providers.get(platform);
  if (!provider)
    throw new Error(`No provider registered for platform: ${platform}`);
  return provider;
}

export function getSupportedAuthTypes(platform: string): string[] {
  const provider = providers.get(platform);
  return provider ? [...provider.supportedAuthTypes] : [];
}
