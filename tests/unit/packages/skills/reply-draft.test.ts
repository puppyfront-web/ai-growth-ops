import { describe, it, expect, vi } from 'vitest';
import type { SkillRunResult, SkillRunner } from '@ai-growth-ops/skills';
import { buildReplyDraftContext, type ReplyDraftContext } from '@ai-growth-ops/shared';

async function importModule() {
  return await import('@ai-growth-ops/skills');
}

function makeRunnerResult<T>(
  overrides: Partial<SkillRunResult<T>> = {}
): SkillRunResult<T> {
  return {
    runId: 'run-1',
    skillName: 'reply-draft',
    skillVersion: '1.0.0',
    status: 'success',
    output: {} as T,
    latencyMs: 10,
    ...overrides
  };
}

describe('reply-draft skill 注册与 schema', () => {
  it('initSkills 后 reply-draft 被自动注册', async () => {
    const { initSkills, getSkill } = await importModule();
    initSkills();
    const skill = getSkill('reply-draft');
    expect(skill).toBeDefined();
    expect(skill!.inputSchema).toBeDefined();
    expect(skill!.outputSchema).toBeDefined();
  });
});

describe('draftReply 回退策略', () => {
  const ctx: ReplyDraftContext = buildReplyDraftContext({
    platform: 'douyin',
    interactionType: 'comment',
    content: '请问多少钱？'
  });

  it('runner 成功时返回草稿输出', async () => {
    const { draftReply } = await importModule();
    const output = {
      needsHuman: false,
      draftText: '已私信您发送报价安排，请查收。',
      replyType: 'guide_to_private',
      riskLevel: 'low'
    };
    const runner: SkillRunner = {
      run: vi.fn().mockResolvedValue(makeRunnerResult({ output }))
    };
    const result = await draftReply(runner, ctx);
    expect(result).toEqual(output);
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'reply-draft', input: ctx })
    );
  });

  it('runner 失败（LLM 调用失败/超时）时返回 null 供调用方走规则模板', async () => {
    const { draftReply } = await importModule();
    const runner: SkillRunner = {
      run: vi.fn().mockResolvedValue(
        makeRunnerResult({ status: 'failed', error: 'LLM timeout' })
      )
    };
    const result = await draftReply(runner, ctx);
    expect(result).toBeNull();
  });

  it('runner 抛异常时返回 null 而不是向上抛错', async () => {
    const { draftReply } = await importModule();
    const runner: SkillRunner = {
      run: vi.fn().mockRejectedValue(new Error('network error'))
    };
    const result = await draftReply(runner, ctx);
    expect(result).toBeNull();
  });

  it('敏感内容时返回 needsHuman=true 标记而非硬编回复', async () => {
    const { draftReply, isReplyDraftNeedsHuman } = await importModule();
    const output = {
      needsHuman: true,
      draftText: '',
      reason: '涉及投诉与法律风险，需人工处理',
      riskLevel: 'high'
    };
    const runner: SkillRunner = {
      run: vi.fn().mockResolvedValue(makeRunnerResult({ output }))
    };
    const result = await draftReply(runner, ctx);
    expect(result).not.toBeNull();
    expect(isReplyDraftNeedsHuman(result)).toBe(true);
  });

  it('成功但 output 缺失 draftText 且非 needsHuman 时视为无效返回 null', async () => {
    const { draftReply } = await importModule();
    const runner: SkillRunner = {
      run: vi.fn().mockResolvedValue(makeRunnerResult({ output: { needsHuman: false } as never }))
    };
    const result = await draftReply(runner, ctx);
    expect(result).toBeNull();
  });
});
