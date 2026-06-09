import type {
  InteractionConnector,
  InteractionConnectorConfig,
  PlatformCode,
  InteractionMode
} from './types.js';
import { SandboxInteractionConnector } from './sandbox-connector.js';
import { DisabledInteractionConnector } from './disabled-connector.js';
import { ManualImportConnector } from './manual-import-connector.js';
import { BrowserAssistInteractionConnector } from './browser-assist-connector.js';
import { HybridInteractionConnector } from './hybrid-connector.js';
import { DouyinConnector } from './douyin-connector.js';
import { XiaohongshuConnector } from './xiaohongshu-connector.js';
import { WechatOfficialConnector } from './wechat-official-connector.js';
import { WechatChannelsConnector } from './wechat-channels-connector.js';
import { BaijiahaoConnector } from './baijiahao-connector.js';
import { ZhihuConnector } from './zhihu-connector.js';

const platformConnectors: Record<
  string,
  new (config: InteractionConnectorConfig) => InteractionConnector
> = {
  douyin: DouyinConnector,
  xiaohongshu: XiaohongshuConnector,
  wechat_official: WechatOfficialConnector,
  wechat_channels: WechatChannelsConnector,
  baijiahao: BaijiahaoConnector,
  zhihu: ZhihuConnector
};

const connectors = new Map<string, InteractionConnector>();

export function registerConnector(connector: InteractionConnector): void {
  connectors.set(connector.platform, connector);
}

export function getConnector(
  platform: PlatformCode
): InteractionConnector | undefined {
  return connectors.get(platform);
}

/**
 * Auto-selects the best connector based on what credentials are available:
 * - accessToken + cookie → HybridInteractionConnector (official API first, browser-assist fallback)
 * - accessToken only     → official_api connector
 * - cookie only          → browser_assist connector
 * - neither              → respects the explicit `mode` param, or disabled
 */
export function getOrCreateConnector(
  platform: PlatformCode,
  mode: InteractionMode,
  config?: InteractionConnectorConfig
): InteractionConnector {
  if (!config) {
    const existing = connectors.get(platform);
    if (existing) return existing;
  }

  const cfg = config || { mode };
  const hasOfficialApi = Boolean(cfg.accessToken);
  const hasBrowserAssist = Boolean(cfg.cookie);

  // Auto-upgrade to hybrid when both credentials are present
  if (
    hasOfficialApi &&
    hasBrowserAssist &&
    mode !== 'sandbox' &&
    mode !== 'recorded' &&
    mode !== 'manual_import' &&
    mode !== 'disabled'
  ) {
    const ConnectorClass = platformConnectors[platform];
    if (ConnectorClass) {
      const primary = new ConnectorClass(cfg);
      const fallback = new BrowserAssistInteractionConnector(platform, cfg);
      return new HybridInteractionConnector(primary, fallback);
    }
  }

  switch (mode) {
    case 'browser_assist': {
      return new BrowserAssistInteractionConnector(platform, cfg);
    }
    case 'official_api': {
      const ConnectorClass = platformConnectors[platform];
      if (ConnectorClass) {
        return new ConnectorClass(cfg);
      }
      return new DisabledInteractionConnector(platform, cfg);
    }
    case 'sandbox':
    case 'recorded':
      return new SandboxInteractionConnector(platform, cfg);
    case 'manual_import':
      return new ManualImportConnector(platform);
    case 'disabled':
    default:
      return new DisabledInteractionConnector(platform, cfg);
  }
}

export function listConnectors(): InteractionConnector[] {
  return Array.from(connectors.values());
}
