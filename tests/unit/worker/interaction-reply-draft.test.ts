import { describe, expect, it, vi } from 'vitest';

// mock skills：捕获 draftReply 收到的 context，行为可注入
const draftReplyMock = vi.fn();
vi.mock('@ai-growth-ops/skills', () => ({
  getSharedSkillRunner: () => ({ run: vi.fn() }),
  draftReply: (...args: unknown[]) => draftReplyMock(...args)
}));

import { buildReplyDraftPipelineContext } from '../../../apps/worker/src/job-handlers/interaction-pipeline.js';
import { buildReplyDraftContext } from '@ai-growth-ops/shared';

function createFakeDb(overrides: Record<string, Partial<Record<string, unknown>>> = {}) {
  return {
    interaction: {
      findUnique: vi.fn(async () => ({
        id: 'it-1',
        organizationId: 'org-1',
        platform: 'douyin',
        externalUserId: 'ext-u1',
        type: 'comment',
        content: '这个多少钱',
        conversationId: null
      })),
      findMany: vi.fn(
        async () => [
          { content: '之前问过尺码', direction: null, createdAt: new Date('2026-11-01T00:00:00Z') },
          { content: '我方已回复过运费', direction: null, createdAt: new Date('2026-11-02T00:00:00Z') }
        ]
      ),
      ...overrides.interaction
    },
    lead: {
      findFirst: vi.fn(async () => ({
        level: 'A',
        intent: 'price_inquiry',
        summary: '女装高意向客户，关注价格与尺码'
      })),
      ...overrides.lead
    },
    appConfig: {
      findFirst: vi.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'reply_style_config'
          ? { value: { tone: '专业克制', bannedWords: ['最低价'], signature: '—小助手' } }
          : null
      ),
      ...overrides.appConfig
    }
  } as unknown as Parameters<typeof buildReplyDraftPipelineContext>[0];
}

describe('buildReplyDraftPipelineContext', () => {
  it('组装画像、最近历史与话术配置为 skill context', async () => {
    const ctx = await buildReplyDraftPipelineContext(createFakeDb(), {
      interactionId: 'it-1',
      content: '这个多少钱',
      platform: 'douyin',
      interactionType: 'comment'
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.interaction.content).toBe('这个多少钱');
    expect(ctx!.customerProfile?.leadLevel).toBe('A');
    expect(ctx!.customerProfile?.summary).toContain('女装高意向');
    expect(ctx!.recentInteractions).toHaveLength(2);
    expect(ctx!.brandStyle?.tone).toBe('专业克制');
    expect(ctx!.brandStyle?.bannedWords).toContain('最低价');
  });

  it('无画像/无历史/无配置时各部分归一化为 null 而不是报错', async () => {
    const db = createFakeDb({
      lead: { findFirst: vi.fn(async () => null) },
      appConfig: { findFirst: vi.fn(async () => null) }
    });
    const dbCast = db as unknown as {
      interaction: { findMany: ReturnType<typeof vi.fn> };
    };
    dbCast.interaction.findMany = vi.fn(async () => []);

    const ctx = await buildReplyDraftPipelineContext(db, {
      interactionId: 'it-1',
      content: '你好',
      platform: 'douyin',
      interactionType: 'comment'
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.customerProfile).toBeNull();
    expect(ctx!.recentInteractions).toEqual([]); // shared 契约：空历史为 []
    expect(ctx!.brandStyle).toBeNull();
  });

  it('互动本身缺失时返回 null（调用方走回退）', async () => {
    const db = createFakeDb({
      interaction: { findUnique: vi.fn(async () => null) }
    });
    const ctx = await buildReplyDraftPipelineContext(db, {
      interactionId: 'missing',
      content: 'x',
      platform: 'douyin',
      interactionType: 'comment'
    });
    expect(ctx).toBeNull();
  });

  it('画像与历史查询必须带 organizationId 过滤（跨组织数据不得进入草稿上下文）', async () => {
    const db = createFakeDb();
    await buildReplyDraftPipelineContext(db, {
      interactionId: 'it-1',
      content: '这个多少钱',
      platform: 'douyin',
      interactionType: 'comment'
    });

    const leadWhere = (db.lead.findFirst as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(leadWhere.organizationId).toBe('org-1');
    const historyWhere = (db.interaction.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0][0].where;
    expect(historyWhere.organizationId).toBe('org-1');
  });

  it('纯函数构建遵循 shared 契约（升序传入、保留最近 N 条）', () => {
    const ctx = buildReplyDraftContext(
      { platform: 'douyin', interactionType: 'comment', content: 'c' },
      { summary: 's', leadLevel: 'B' },
      [
        { content: '旧', occurredAt: '2026-10-01T00:00:00Z' },
        { content: '新', occurredAt: '2026-11-01T00:00:00Z' }
      ],
      { tone: 't' }
    );
    expect(ctx.recentInteractions).toHaveLength(2);
    expect(ctx.recentInteractions?.at(-1)?.content).toBe('新');
  });
});
