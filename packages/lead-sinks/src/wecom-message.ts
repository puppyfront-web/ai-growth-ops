import type { NotifySink, LeadData, SinkResult, LeadSinkConfig } from './types.js';

export class WeComAppMessageSink implements NotifySink {
  readonly sinkType = 'wecom_app_message';

  async notify(lead: LeadData, config: LeadSinkConfig, message?: string): Promise<SinkResult> {
    const { corpId, secret, agentId } = config;
    if (!corpId || !secret || !agentId) {
      return { success: false, errorCode: 'MISSING_CONFIG', errorMessage: 'WeCom corpId, secret, and agentId are required' };
    }

    try {
      const token = await this.getAccessToken(corpId, secret);
      if (!token) {
        return { success: false, errorCode: 'AUTH_FAILED', errorMessage: 'Failed to get WeCom access token' };
      }

      const text = message || this.formatLeadMessage(lead);
      const resp = await fetch(
        'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: lead.assignedTo || '@all',
            msgtype: 'textcard',
            agentid: agentId,
            textcard: {
              title: `New Lead: ${lead.externalUserName || 'Unknown'} (${lead.level}级)`,
              description: text,
              url: config.webhookUrl || 'https://example.com',
              btntxt: 'View Details',
            },
          }),
        },
      );

      const data = await resp.json() as Record<string, unknown>;
      if (data.errcode === 0) {
        return { success: true, externalId: `wecom-msg-${Date.now()}` };
      }
      return {
        success: false,
        errorCode: String(data.errcode),
        errorMessage: String(data.errmsg || 'WeCom message send failed'),
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  private formatLeadMessage(lead: LeadData): string {
    const parts = [
      `<div class="highlight">Lead Level: ${lead.level}</div>`,
      `Source: ${lead.sourcePlatform}`,
      lead.externalUserName ? `Customer: ${lead.externalUserName}` : '',
      lead.intent ? `Intent: ${lead.intent}` : '',
      lead.summary ? `Summary: ${lead.summary}` : '',
    ];
    return parts.filter(Boolean).join('<br>');
  }

  private async getAccessToken(corpId: string, secret: string): Promise<string | null> {
    try {
      const resp = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`,
      );
      const data = await resp.json() as Record<string, unknown>;
      return (data.access_token as string) || null;
    } catch {
      return null;
    }
  }
}
