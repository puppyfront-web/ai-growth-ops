import { beforeEach, describe, expect, it, vi } from 'vitest';

/** org:platform:user → 是否拉黑 */
const blockedSet = new Set<string>();
const createDatabaseClientMock = vi.fn();

vi.mock('@ai-growth-ops/database', () => ({
  createDatabaseClient: (...args: unknown[]) =>
    createDatabaseClientMock(...args),
  isInteractionTargetBlocked: vi.fn(
    async (_db: unknown, org: string, platform: string, user: string) =>
      blockedSet.has(`${org}:${platform}:${user}`)
  )
}));

describe('reply handlers 发送前黑名单检查', () => {
  beforeEach(() => {
    blockedSet.clear();
    createDatabaseClientMock.mockReset();
  });

  it('auto-reply 命中黑名单抛 BLOCKLISTED_TARGET，建议置 rejected', async () => {
    const { handleInteractionAutoReply } = await import(
      '../../../apps/worker/src/job-handlers/interaction.auto-reply.js'
    );

    const suggestionUpdates: Array<Record<string, unknown>> = [];
    createDatabaseClientMock.mockReturnValue({
      interaction: {
        findUnique: async () => ({
          id: 'it-9',
          organizationId: 'org-1',
          platform: 'douyin',
          externalUserId: 'ext-9',
          type: 'comment',
          externalInteractionId: 'c-9',
          platformAccount: { id: 'acc', cookieRef: 'enc' },
          replySuggestions: [
            { id: 'sg-9', status: 'waiting_review', suggestedText: 'hi' }
          ],
          rawPayload: {}
        })
      },
      replySuggestion: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          suggestionUpdates.push(data);
          return data;
        }
      },
      replyAttempt: { create: vi.fn() },
      platformAccount: { update: vi.fn() }
    });

    blockedSet.add('org-1:douyin:ext-9');

    await expect(
      handleInteractionAutoReply({
        data: { interactionId: 'it-9', replySuggestionId: 'sg-9' }
      } as never)
    ).rejects.toMatchObject({ code: 'BLOCKLISTED_TARGET' });
    expect(suggestionUpdates[0]).toEqual(
      expect.objectContaining({
        status: 'rejected',
        decisionReason: 'blocklisted'
      })
    );
  });

  it('manual-reply 命中黑名单抛 BLOCKLISTED_TARGET', async () => {
    const { handleInteractionManualReply } = await import(
      '../../../apps/worker/src/job-handlers/interaction.manual-reply.js'
    );

    createDatabaseClientMock.mockReturnValue({
      interaction: {
        findUnique: async () => ({
          id: 'it-8',
          organizationId: 'org-1',
          platform: 'douyin',
          externalUserId: 'ext-8',
          type: 'message',
          externalInteractionId: 'm-8',
          platformAccount: { id: 'acc', cookieRef: 'enc' },
          rawPayload: {}
        }),
        update: vi.fn(async ({ data }) => data)
      },
      replyAttempt: { create: vi.fn() },
      replySuggestion: { update: vi.fn() }
    });

    blockedSet.add('org-1:douyin:ext-8');

    await expect(
      handleInteractionManualReply({
        data: { interactionId: 'it-8', replyContent: 'hi' }
      } as never)
    ).rejects.toMatchObject({ code: 'BLOCKLISTED_TARGET' });
  });
});
