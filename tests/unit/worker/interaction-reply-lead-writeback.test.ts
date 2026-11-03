import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── 模块 mock ─────────────────────────────────────────────────────
// db 用可注入行为的 fake；网络/加解密/连接器全部隔离。
vi.mock('@ai-growth-ops/database', () => ({
  createDatabaseClient: () => currentDb,
  isInteractionTargetBlocked: async () => false
}));
vi.mock('@ai-growth-ops/providers', () => ({
  decryptToken: () => 'encrypted-cookie'
}));
vi.mock('@ai-growth-ops/observability', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {}
  })
}));
vi.mock('@ai-growth-ops/connectors', () => ({
  getOrCreateConnector: vi.fn()
}));
vi.mock('@ai-growth-ops/shared', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../packages/shared/src/index.js')
  >()),
  getBrowserRunnerConfig: () => ({ url: 'http://runner.local' }),
  getBrowserRunnerHeaders: () => ({ 'content-type': 'application/json' })
}));

import { handleInteractionAutoReply } from '../../../apps/worker/src/job-handlers/interaction.auto-reply.js';
import { writeBackReplyToLead } from '../../../apps/worker/src/job-handlers/reply-lead-writeback.js';

// ── fake db 构造 ──────────────────────────────────────────────────
interface TxMocks {
  lead: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  leadActivity: { create: ReturnType<typeof vi.fn> };
}

interface FakeDb {
  interaction: Record<string, ReturnType<typeof vi.fn>>;
  replySuggestion: Record<string, ReturnType<typeof vi.fn>>;
  replyAttempt: Record<string, ReturnType<typeof vi.fn>>;
  lead: Record<string, ReturnType<typeof vi.fn>>;
  leadActivity: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
}

let currentDb: FakeDb;

function createFakeDb(overrides: {
  leadByInteraction?: { id: string } | null;
} = {}): FakeDb {
  return {
    interaction: {
      findUnique: vi.fn(async () => ({
        id: 'it-1',
        organizationId: 'org-1',
        platform: 'douyin',
        externalUserId: 'ext-u1',
        externalInteractionId: 'ext-c1',
        type: 'comment',
        rawPayload: {},
        platformAccount: { id: 'acc-1', cookieRef: 'enc' },
        replySuggestions: [
          { id: 'sug-1', leadId: null, status: 'draft', suggestedText: '您好' }
        ]
      })),
      update: vi.fn(async () => ({}))
    },
    replySuggestion: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ leadId: null }))
    },
    replyAttempt: { create: vi.fn(async () => ({})) },
    lead: {
      findFirst: vi.fn(async () => overrides.leadByInteraction ?? null),
      update: vi.fn(async () => ({}))
    },
    leadActivity: { create: vi.fn(async () => ({})) },
    // 事务实现：记录回调，供测试手动重放并断言事务内写入
    $transaction: vi.fn(async (fn: (tx: TxMocks) => Promise<void>) => fn(txOf(fn)))
  };
}

function txOf(_fn: (tx: TxMocks) => Promise<void>): TxMocks {
  return {
    lead: {
      findFirst: vi.fn(async () => ({ id: 'lead-1', status: 'NEW' })),
      update: vi.fn(async () => ({}))
    },
    leadActivity: { create: vi.fn(async () => ({})) }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('writeBackReplyToLead', () => {
  it('成功回写：lastContactedAt 更新、写 reply_sent 活动、NEW→CONTACTED', async () => {
    const db = createFakeDb({ leadByInteraction: { id: 'lead-1' } });
    await writeBackReplyToLead(db as never, {
      interactionId: 'it-1',
      organizationId: 'org-1',
      suggestionLeadId: null,
      replySuggestionId: 'sug-1',
      source: 'auto_reply'
    });

    // 反查带组织隔离过滤
    expect(db.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceInteractionId: 'it-1',
          deletedAt: null,
          organizationId: 'org-1'
        })
      })
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const tx = txOf(db.$transaction.mock.calls[0][0]);
    await (db.$transaction.mock.calls[0][0] as (t: TxMocks) => Promise<void>)(tx);

    expect(tx.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          status: 'CONTACTED',
          lastContactedAt: expect.any(Date)
        })
      })
    );
    expect(tx.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-1',
          action: 'reply_sent',
          operator: 'system'
        })
      })
    );
  });

  it('leadId 解析不出时跳过（不进事务、不更新 lead）', async () => {
    const db = createFakeDb({ leadByInteraction: null });
    await writeBackReplyToLead(db as never, {
      interactionId: 'it-1',
      organizationId: 'org-1',
      suggestionLeadId: null,
      source: 'manual_reply'
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('状态 CONTACTED 保持不变：更新 lastContactedAt 但不写 status', async () => {
    const db = createFakeDb({ leadByInteraction: { id: 'lead-1' } });
    await writeBackReplyToLead(db as never, {
      interactionId: 'it-1',
      organizationId: 'org-1',
      suggestionLeadId: null,
      source: 'auto_reply'
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const callback = db.$transaction.mock.calls[0][0] as (
      t: TxMocks
    ) => Promise<void>;
    const tx = txOf(callback);
    tx.lead.findFirst = vi.fn(async () => ({
      id: 'lead-1',
      status: 'CONTACTED'
    }));
    await callback(tx);

    const data = tx.lead.update.mock.calls[0][0].data;
    expect(data.lastContactedAt).toBeInstanceOf(Date);
    expect(data.status).toBeUndefined();
    expect(tx.leadActivity.create).toHaveBeenCalledTimes(1);
  });

  it('建议自身 leadId 优先于 interaction 反查结果', async () => {
    const db = createFakeDb({ leadByInteraction: { id: 'lead-by-interaction' } });
    await writeBackReplyToLead(db as never, {
      interactionId: 'it-1',
      organizationId: 'org-1',
      suggestionLeadId: 'lead-from-suggestion',
      source: 'auto_reply'
    });
    const callback = db.$transaction.mock.calls[0][0] as (
      t: TxMocks
    ) => Promise<void>;
    const tx = txOf(callback);
    tx.lead.findFirst = vi.fn(async () => ({
      id: 'lead-from-suggestion',
      status: 'ASSIGNED'
    }));
    await callback(tx);

    expect(tx.lead.findFirst.mock.calls[0][0].where.id).toBe(
      'lead-from-suggestion'
    );
    // ASSIGNED → CONTACTED
    expect(tx.lead.update.mock.calls[0][0].data.status).toBe('CONTACTED');
  });
});

describe('auto-reply 处理器与回写的衔接', () => {
  it('发送成功后触发回写', async () => {
    const db = createFakeDb({ leadByInteraction: { id: 'lead-1' } });
    currentDb = db;
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ replyId: 'r-1' }), { status: 200 })
    ) as typeof fetch;

    await handleInteractionAutoReply({
      data: { interactionId: 'it-1', replySuggestionId: 'sug-1' }
    } as never);

    expect(db.replyAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' })
      })
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.lead.findFirst).toHaveBeenCalled();
  });

  it('发送失败不回写（无事务、无 lead 更新、无活动）', async () => {
    const db = createFakeDb({ leadByInteraction: { id: 'lead-1' } });
    currentDb = db;
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
    ) as typeof fetch;

    await expect(
      handleInteractionAutoReply({
        data: { interactionId: 'it-1', replySuggestionId: 'sug-1' }
      } as never)
    ).rejects.toThrow('boom');

    expect(db.replyAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' })
      })
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.lead.update).not.toHaveBeenCalled();
    expect(db.leadActivity.create).not.toHaveBeenCalled();
  });
});
