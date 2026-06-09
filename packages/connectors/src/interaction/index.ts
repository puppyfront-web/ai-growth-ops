export type {
  InteractionConnector,
  InteractionCapabilities,
  InteractionConnectorConfig,
  PlatformCode,
  InteractionMode,
  InteractionType,
  FetchCommentsInput,
  FetchMessagesInput,
  ReplyCommentInput,
  ReplyMessageInput,
  PlatformComment,
  PlatformMessage,
  ReplyResult,
  MarkHandledInput,
  MarkHandledResult
} from './types.js';
export { SandboxInteractionConnector } from './sandbox-connector.js';
export { DisabledInteractionConnector } from './disabled-connector.js';
export { ManualImportConnector } from './manual-import-connector.js';
export { HybridInteractionConnector } from './hybrid-connector.js';
export { DouyinConnector } from './douyin-connector.js';
export { XiaohongshuConnector } from './xiaohongshu-connector.js';
export { WechatOfficialConnector } from './wechat-official-connector.js';
export { WechatChannelsConnector } from './wechat-channels-connector.js';
export { BaijiahaoConnector } from './baijiahao-connector.js';
export { ZhihuConnector } from './zhihu-connector.js';
export {
  registerConnector,
  getConnector,
  getOrCreateConnector,
  listConnectors
} from './registry.js';
export { BrowserAssistClient } from './browser-assist-client.js';
