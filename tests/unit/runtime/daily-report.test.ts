import { describe, it, expect } from 'vitest';
import { buildDailyReport } from '@ai-growth-ops/runtime';
import type { SupervisorState } from '@ai-growth-ops/runtime';

const state = (over: Partial<SupervisorState> = {}): SupervisorState => ({
  runId: 'r1abcdef',
  userId: 'u',
  orgId: 'o',
  autonomyLevel: 'L2_AUTOPILOT_LIGHT',
  dryRun: true,
  currentNode: 'REVIEW',
  startedAt: '2026-06-23T00:00:00.000Z',
  status: 'completed',
  nodeResults: {
    INIT: { node: 'INIT', outcome: 'done', summary: '登录正常' },
    METRICS: { node: 'METRICS', outcome: 'done', summary: '3 条视频' },
    CONTENT: undefined,
    PUBLISH: undefined,
    REVIEW: { node: 'REVIEW', outcome: 'done', summary: '今日复盘' }
  },
  ...over
});

describe('buildDailyReport', () => {
  it('synthesizes a markdown report from node summaries', () => {
    const r = buildDailyReport(state());
    expect(r.title).toMatch(/运营日报|daily/i);
    expect(r.markdown).toContain('INIT');
    expect(r.markdown).toContain('登录正常');
    expect(r.markdown).toContain('3 条视频');
    expect(r.markdown).toContain('今日复盘');
    expect(r.markdown).toContain('r1abcdef'.slice(0, 8));
  });

  it('flags escalated items when present', () => {
    const s = state({
      nodeResults: {
        INIT: {
          node: 'INIT',
          outcome: 'need_input',
          summary: '需人工确认',
          escalatedItems: [{ toolName: 'publish.video', input: {}, risk: 'high' }]
        },
        METRICS: undefined,
        CONTENT: undefined,
        PUBLISH: undefined,
        REVIEW: undefined
      }
    });
    const r = buildDailyReport(s);
    expect(r.markdown).toMatch(/需人工|人工处理|escalat/i);
    expect(r.markdown).toContain('publish.video');
  });

  it('marks unexecuted nodes explicitly', () => {
    const r = buildDailyReport(state());
    expect(r.markdown).toMatch(/CONTENT.*未执行|未执行.*CONTENT|—/);
  });
});
