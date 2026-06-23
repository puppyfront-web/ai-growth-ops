import { buildDailyReport, type SupervisorState } from '@ai-growth-ops/runtime';
import type { DatabaseClient } from '@ai-growth-ops/database';

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Post an interactive card to a Feishu/Lark incoming webhook. Generalized from
 * packages/lead-sinks/src/feishu-bot.ts (which is lead-specific) so the daily report
 * can reuse the same webhook POST pattern.
 */
export async function sendFeishuWebhook(webhookUrl: string, title: string, markdown: string): Promise<SendResult> {
  if (!webhookUrl) return { success: false, error: 'missing webhook url' };
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: title }, template: 'blue' },
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: markdown } }]
        }
      })
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (data.code === 0 || data.StatusCode === 0) return { success: true };
    return { success: false, error: String(data.msg || data.StatusMessage || data.code) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

export interface PublishDailyReportOptions {
  feishuWebhookUrl?: string;
  /** injectable for testing */
  sendFeishu?: (url: string, title: string, markdown: string) => Promise<SendResult>;
}

export interface PublishResult {
  notifiedFeishu: boolean;
  feishuError?: string;
}

/**
 * Publish the daily report after a run: always write an in-app Notification; push to
 * Feishu only when a webhook is configured. Report delivery must never fail the run —
 * callers wrap this in a catch (see agent.run.ts).
 */
export async function publishDailyReport(
  state: SupervisorState,
  db: DatabaseClient,
  opts: PublishDailyReportOptions
): Promise<PublishResult> {
  const { title, markdown } = buildDailyReport(state);
  const hasEscalations = Object.values(state.nodeResults).some(
    (r) => r && r.escalatedItems && r.escalatedItems.length > 0
  );

  await db.notification.create({
    data: {
      type: 'daily_report',
      title,
      content: markdown,
      level: hasEscalations ? 'warning' : 'info',
      userId: state.userId,
      organizationId: state.orgId
    }
  } as never);

  if (!opts.feishuWebhookUrl) return { notifiedFeishu: false };
  const send = opts.sendFeishu ?? sendFeishuWebhook;
  const r = await send(opts.feishuWebhookUrl, title, markdown);
  return { notifiedFeishu: r.success, feishuError: r.error };
}
