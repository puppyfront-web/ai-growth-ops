import type { PublishConnector, PublishConnectorConfig } from './types.js';
import type { PlatformCode, InteractionMode } from '../interaction/types.js';
import { SandboxPublishConnector } from './sandbox-connector.js';
import { DisabledPublishConnector } from './disabled-connector.js';
import { ManualImportPublishConnector } from './manual-import-connector.js';
import { DouyinPublishConnector } from './douyin-connector.js';
import { XiaohongshuPublishConnector } from './xiaohongshu-connector.js';
import { WechatOfficialPublishConnector } from './wechat-official-connector.js';
import { WechatChannelsPublishConnector } from './wechat-channels-connector.js';
import { BaijiahaoPublishConnector } from './baijiahao-connector.js';
import { ZhihuPublishConnector } from './zhihu-connector.js';

const platformPublishConnectors: Record<
  string,
  new (config: PublishConnectorConfig) => PublishConnector
> = {
  douyin: DouyinPublishConnector,
  xiaohongshu: XiaohongshuPublishConnector,
  wechat_official: WechatOfficialPublishConnector,
  wechat_channels: WechatChannelsPublishConnector,
  baijiahao: BaijiahaoPublishConnector,
  zhihu: ZhihuPublishConnector
};

const publishConnectors = new Map<string, PublishConnector>();

export function registerPublishConnector(connector: PublishConnector): void {
  publishConnectors.set(connector.platform, connector);
}

export function getPublishConnector(
  platform: PlatformCode
): PublishConnector | undefined {
  return publishConnectors.get(platform);
}

export function getOrCreatePublishConnector(
  platform: PlatformCode,
  mode: InteractionMode,
  config?: PublishConnectorConfig
): PublishConnector {
  const existing = publishConnectors.get(platform);
  if (existing) return existing;

  switch (mode) {
    case 'official_api': {
      const ConnectorClass = platformPublishConnectors[platform];
      if (ConnectorClass) {
        const connector = new ConnectorClass(config || { mode });
        publishConnectors.set(platform, connector);
        return connector;
      }
      return new DisabledPublishConnector(platform, config || { mode });
    }
    case 'browser_assist': {
      const ConnectorClass = platformPublishConnectors[platform];
      if (ConnectorClass) {
        const connector = new ConnectorClass(config || { mode });
        publishConnectors.set(platform, connector);
        return connector;
      }
      return new DisabledPublishConnector(platform, config || { mode });
    }
    case 'sandbox':
    case 'recorded':
      return new SandboxPublishConnector(platform, config || { mode });
    case 'manual_import':
      return new ManualImportPublishConnector(platform, config);
    case 'disabled':
    default:
      return new DisabledPublishConnector(platform, config || { mode });
  }
}

export function listPublishConnectors(): PublishConnector[] {
  return Array.from(publishConnectors.values());
}
