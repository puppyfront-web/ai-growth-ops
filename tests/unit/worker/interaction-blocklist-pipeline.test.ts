import { describe, expect, it, vi } from 'vitest';

// classifyAndSuggestReply 依赖 skills runner；黑名单路径不应触发 AI 调用
vi.mock('@ai-growth-ops/skills', () => ({
  getSharedSkillRunner: () => ({
    run: vi.fn(() => {
      throw new Error('AI runner should not be called for blocklisted target');
    })
  })
}));

import {
  applyInteractionBlocklistGuard,
  classifyAndSuggestReply
} from '../../../apps/worker/src/job-handlers/interaction-pipeline.js';

type FakeInteraction = {
  id: string;
  organizationId: string;
  userId: string;
  platform: string;
  externalUserId: string;
  type: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type FakeSuggestion = {
  interactionId: string;
  status: string;
  decision: string | null;
  decisionReason: string | null;
};

function createFakePipelineDb(opts: {
  interaction: FakeInteraction;
  suggestions?: FakeSuggestion[];
  preBlocked?: boolean;
}) {
  const state = {
    blocklistRows: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    updatedSuggestions: [] as FakeSuggestion[],
    interactions: [opts.interaction],
    suggestions: opts.suggestions ?? []
  };
  if (opts.preBlocked) {
    state.blocklistRows.push({
      organizationId: opts.interaction.organizationId,
      platform: opts.interaction.platform,
      platformUserId: opts.interaction.externalUserId,
      deletedAt: null
    });
  }
  const db = {
    state,
    interaction: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.interactions.find((r) => r.id === where.id);
        if (!row) return null;
        return {
          ...row,
          // pipeline 后续步骤需要的选择字段
          platformAccountId: 'acc-1',
          externalUserName: 'tester',
          publishJobId: null,
          conversationId: null,
          content: ''
        };
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<FakeInteraction>;
      }) => {
        const row = state.interactions.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }
    },
    interactionBlocklist: {
      findUnique: async () => null,
      findFirst: async ({
        where
      }: {
        where: {
          organizationId: string;
          platform: string;
          platformUserId: string;
          deletedAt: null;
        };
      }) =>
        state.blocklistRows.find(
          (r) =>
            r.organizationId === where.organizationId &&
            r.platform === where.platform &&
            r.platformUserId === where.platformUserId &&
            r.deletedAt === null
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `bl-${state.blocklistRows.length + 1}`,
          deletedAt: null,
          ...data
        };
        state.blocklistRows.push(row);
        return row;
      },
      update: async () => {
        throw new Error('not used');
      }
    },
    replySuggestion: {
      updateMany: async ({
        where,
        data
      }: {
        where: { interactionId: string; status?: string };
        data: Partial<FakeSuggestion>;
      }) => {
        let count = 0;
        for (const s of state.suggestions) {
          if (
            s.interactionId === where.interactionId &&
            (!where.status || s.status === where.status)
          ) {
            Object.assign(s, data);
            state.updatedSuggestions.push(s);
            count++;
          }
        }
        return { count };
      },
      create: vi.fn()
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.auditLogs.push(data);
        return data;
      }
    }
  };
  return db;
}

const baseInteraction = (): FakeInteraction => ({
  id: 'it-1',
  organizationId: 'org-1',
  userId: 'user-1',
  platform: 'douyin',
  externalUserId: 'ext-user-1',
  type: 'message',
  status: 'NEW',
  metadata: null
});

describe('applyInteractionBlocklistGuard', () => {
  it('命中黑名单：标记 metadata.blocklisted、跳过、waiting_review 建议置 rejected', async () => {
    const db = createFakePipelineDb({
      interaction: baseInteraction(),
      suggestions: [
        { interactionId: 'it-1', status: 'waiting_review', decision: null, decisionReason: null },
        { interactionId: 'it-1', status: 'sent', decision: null, decisionReason: null }
      ],
      preBlocked: true
    });

    const blocked = await applyInteractionBlocklistGuard(db, {
      interactionId: 'it-1',
      content: '多少钱',
      platform: 'douyin',
      interactionType: 'message'
    });

    expect(blocked).toBe(true);
    expect(db.state.interactions[0].metadata).toEqual(
      expect.objectContaining({ blocklisted: true })
    );
    expect(db.state.interactions[0].status).toBe('IGNORED');
    expect(db.state.updatedSuggestions).toHaveLength(1);
    expect(db.state.updatedSuggestions[0].status).toBe('rejected');
    expect(db.state.updatedSuggestions[0].decisionReason).toBe('blocklisted');
    // sent 的建议不受影响
    expect(
      db.state.suggestions.find((s) => s.status === 'sent')
    ).toBeTruthy();
  });

  it('私信命中退订意图：自动入黑名单 reason=unsubscribe 并写 AuditLog', async () => {
    const db = createFakePipelineDb({ interaction: baseInteraction() });

    const blocked = await applyInteractionBlocklistGuard(db, {
      interactionId: 'it-1',
      content: '请不要再发消息给我了，退订',
      platform: 'douyin',
      interactionType: 'message'
    });

    expect(blocked).toBe(true);
    expect(db.state.blocklistRows).toHaveLength(1);
    expect(db.state.blocklistRows[0]).toEqual(
      expect.objectContaining({ reason: 'unsubscribe' })
    );
    expect(db.state.auditLogs).toHaveLength(1);
  });

  it('评论命中退订关键词：不自动拉黑（只对私信生效）', async () => {
    const interaction = { ...baseInteraction(), type: 'comment' };
    const db = createFakePipelineDb({ interaction });

    const blocked = await applyInteractionBlocklistGuard(db, {
      interactionId: 'it-1',
      content: '退订',
      platform: 'douyin',
      interactionType: 'comment'
    });

    expect(blocked).toBe(false);
    expect(db.state.blocklistRows).toHaveLength(0);
  });

  it('未命中黑名单且无退订意图：返回 false 不改动', async () => {
    const db = createFakePipelineDb({ interaction: baseInteraction() });

    const blocked = await applyInteractionBlocklistGuard(db, {
      interactionId: 'it-1',
      content: '请问价格多少',
      platform: 'douyin',
      interactionType: 'message'
    });

    expect(blocked).toBe(false);
    expect(db.state.interactions[0].status).toBe('NEW');
    expect(db.state.auditLogs).toHaveLength(0);
  });
});

describe('classifyAndSuggestReply 黑名单短路', () => {
  it('命中黑名单时不触发分类（AI runner 不被调用）', async () => {
    const db = createFakePipelineDb({
      interaction: baseInteraction(),
      preBlocked: true
    });

    await classifyAndSuggestReply(db, 'it-1', '多少钱', 'douyin', 'message');

    expect(db.interaction.update).toBeTruthy();
    expect(db.state.interactions[0].status).toBe('IGNORED');
    expect(db.state.interactions[0].metadata).toEqual(
      expect.objectContaining({ blocklisted: true })
    );
    expect(db.replySuggestion.create).not.toHaveBeenCalled();
  });
});
