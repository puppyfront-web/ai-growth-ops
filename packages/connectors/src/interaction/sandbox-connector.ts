import type {
  InteractionConnector,
  InteractionCapabilities,
  InteractionConnectorConfig,
  FetchCommentsInput,
  FetchMessagesInput,
  PlatformComment,
  PlatformMessage,
  ReplyCommentInput,
  ReplyMessageInput,
  ReplyResult
} from './types.js';
import { randomUUID } from 'crypto';

export class SandboxInteractionConnector implements InteractionConnector {
  readonly platform;
  private config: InteractionConnectorConfig;

  constructor(platform: string, config: InteractionConnectorConfig) {
    this.platform = platform;
    this.config = config;
  }

  async getCapabilities(): Promise<InteractionCapabilities> {
    return {
      platform: this.platform,
      fetchComments: true,
      fetchMessages: true,
      replyComments: true,
      replyMessages: true,
      webhookSupported: false,
      pollingSupported: true,
      browserAssistSupported: false,
      manualImportSupported: true,
      autoReplyAllowed: true,
      requiresHumanReviewForMessageReply: false,
      requiresHumanReviewForLeadLevelA: false,
      supportedModes: ['sandbox', 'recorded']
    };
  }

  async fetchComments(input: FetchCommentsInput): Promise<PlatformComment[]> {
    const comments: PlatformComment[] = [];
    const count = Math.min(input.limit || 10, 20);
    for (let i = 0; i < count; i++) {
      comments.push({
        externalCommentId: `sandbox_comment_${randomUUID().slice(0, 8)}`,
        externalUserId: `sandbox_user_${i}`,
        userNickname: `沙箱用户${i + 1}`,
        content: this.getMockContent(i),
        likeCount: Math.floor(Math.random() * 100),
        replyCount: Math.floor(Math.random() * 5),
        publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
        sourceContentId: input.sourceContentId || 'sandbox_content',
        sourceContentTitle: '沙箱测试内容'
      });
    }
    return comments;
  }

  async fetchMessages(input: FetchMessagesInput): Promise<PlatformMessage[]> {
    const messages: PlatformMessage[] = [];
    const count = Math.min(input.limit || 5, 10);
    for (let i = 0; i < count; i++) {
      messages.push({
        externalMessageId: `sandbox_msg_${randomUUID().slice(0, 8)}`,
        externalUserId: `sandbox_user_${i}`,
        userNickname: `沙箱用户${i + 1}`,
        content: this.getMockMessage(i),
        type: 'text',
        publishedAt: new Date(Date.now() - i * 1800000).toISOString()
      });
    }
    return messages;
  }

  async replyComment(_input: ReplyCommentInput): Promise<ReplyResult> {
    return {
      success: true,
      externalReplyId: `sandbox_reply_${randomUUID().slice(0, 8)}`
    };
  }

  async replyMessage(_input: ReplyMessageInput): Promise<ReplyResult> {
    return {
      success: true,
      externalReplyId: `sandbox_msg_reply_${randomUUID().slice(0, 8)}`
    };
  }

  private getMockContent(index: number): string {
    const templates = [
      '多少钱？可以预约吗？',
      '这个效果怎么样？有案例吗？',
      '在哪里可以体验？',
      '太贵了吧，有优惠吗？',
      '已关注，等更新！',
      '请问你们的服务包括哪些内容？',
      '能介绍一下你们的解决方案吗？',
      '有用过的人来分享一下体验吗？',
      '我想了解一下具体价格',
      '这个适合我们这种小企业吗？'
    ];
    return templates[index % templates.length];
  }

  private getMockMessage(index: number): string {
    const templates = [
      '你好，我想咨询一下你们的服务',
      '请问价格是多少？',
      '能发一份详细方案给我吗？',
      '我们公司有20人左右，适合用什么方案？',
      '谢谢，我先了解一下'
    ];
    return templates[index % templates.length];
  }
}
