import type { NotifySink, LeadData, SinkResult, LeadSinkConfig } from './types.js';

export class FeishuBotSink implements NotifySink {
  readonly sinkType = 'feishu_bot';

  async notify(lead: LeadData, config: LeadSinkConfig, message?: string): Promise<SinkResult> {
    const { webhookUrl } = config;
    if (!webhookUrl) {
      return { success: false, errorCode: 'MISSING_CONFIG', errorMessage: 'Feishu webhook URL is required' };
    }

    try {
      const text = message || this.formatLeadNotification(lead);
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'interactive',
          card: {
            header: {
              title: { tag: 'plain_text', content: `New Lead: ${lead.externalUserName || 'Unknown'}` },
              template: lead.level === 'A' ? 'red' : lead.level === 'B' ? 'orange' : 'blue',
            },
            elements: [
              { tag: 'div', text: { tag: 'plain_text', content: text } },
              {
                tag: 'action',
                actions: [{
                  tag: 'button',
                  text: { tag: 'plain_text', content: 'View Lead' },
                  type: 'primary',
                }],
              },
            ],
          },
        }),
      });

      const data = await resp.json() as Record<string, unknown>;
      if (data.code === 0 || data.StatusCode === 0) {
        return { success: true, externalId: `feishu-bot-${Date.now()}` };
      }
      return {
        success: false,
        errorCode: String(data.code || data.StatusCode),
        errorMessage: String(data.msg || data.StatusMessage || 'Feishu bot notification failed'),
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  private formatLeadNotification(lead: LeadData): string {
    const parts = [
      `Lead Level: ${lead.level}`,
      `Source: ${lead.sourcePlatform}`,
      lead.externalUserName ? `Customer: ${lead.externalUserName}` : '',
      lead.intent ? `Intent: ${lead.intent}` : '',
      lead.summary ? `Summary: ${lead.summary}` : '',
      lead.confidence ? `Confidence: ${(lead.confidence * 100).toFixed(0)}%` : '',
      lead.assignedTo ? `Assigned to: ${lead.assignedTo}` : '',
    ];
    return parts.filter(Boolean).join('\n');
  }
}
