import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  sendFeishuWebhook,
  publishDailyReport
} from '../../../apps/worker/src/notifications';
import type { SupervisorState } from '@ai-growth-ops/runtime';

afterEach(() => vi.restoreAllMocks());

const state = (over: Partial<SupervisorState> = {}): SupervisorState => ({
  runId: 'r1',
  userId: 'u',
  orgId: 'o',
  autonomyLevel: 'L2_AUTOPILOT_LIGHT',
  dryRun: true,
  currentNode: 'REVIEW',
  startedAt: '2026-06-23T00:00:00.000Z',
  status: 'completed',
  nodeResults: {
    INIT: { node: 'INIT', outcome: 'done', summary: 'ok' },
    METRICS: undefined,
    CONTENT: undefined,
    PUBLISH: undefined,
    REVIEW: { node: 'REVIEW', outcome: 'done', summary: '复盘' }
  },
  ...over
});

describe('sendFeishuWebhook', () => {
  it('POSTs an interactive card and returns success on code 0', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ code: 0 }) } as never);
    const r = await sendFeishuWebhook('https://hook', '运营日报', '# 报告\n内容');
    expect(r.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://hook', expect.objectContaining({ method: 'POST' }));
  });

  it('returns failure when webhook url missing', async () => {
    const r = await sendFeishuWebhook('', 't', 'm');
    expect(r.success).toBe(false);
  });

  it('returns failure on non-zero code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 19021, msg: 'bad' })
    } as never);
    const r = await sendFeishuWebhook('https://hook', 't', 'm');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/bad/);
  });

  it('returns failure on network throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const r = await sendFeishuWebhook('https://hook', 't', 'm');
    expect(r.success).toBe(false);
    expect(r.error).toBe('boom');
  });
});

describe('publishDailyReport', () => {
  it('always writes an in-app Notification; pushes feishu only when webhook configured', async () => {
    const created: Array<Record<string, unknown>> = [];
    const db = {
      notification: { create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return a; } }
    } as never;
    const feishu = vi.fn(async () => ({ success: true }));
    const r = await publishDailyReport(state(), db, { feishuWebhookUrl: undefined, sendFeishu: feishu });
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('daily_report');
    expect(created[0].userId).toBe('u');
    expect(feishu).not.toHaveBeenCalled();
    expect(r.notifiedFeishu).toBe(false);
  });

  it('pushes feishu when webhook configured', async () => {
    const db = { notification: { create: async () => ({}) } } as never;
    const feishu = vi.fn(async () => ({ success: true }));
    const r = await publishDailyReport(state(), db, { feishuWebhookUrl: 'https://hook', sendFeishu: feishu });
    expect(feishu).toHaveBeenCalledOnce();
    expect(r.notifiedFeishu).toBe(true);
  });

  it('marks the Notification level warning when escalations present', async () => {
    let level = '';
    const db = {
      notification: { create: async (a: { data: { level: string } }) => { level = a.data.level; return a; } }
    } as never;
    await publishDailyReport(
      state({
        nodeResults: {
          INIT: {
            node: 'INIT',
            outcome: 'need_input',
            summary: '需人工',
            escalatedItems: [{ toolName: 'publish.video', input: {}, risk: 'high' }]
          },
          METRICS: undefined,
          CONTENT: undefined,
          PUBLISH: undefined,
          REVIEW: undefined
        }
      }),
      db,
      { sendFeishu: vi.fn(async () => ({ success: true })) }
    );
    expect(level).toBe('warning');
  });
});
