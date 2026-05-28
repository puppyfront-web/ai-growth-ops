import type { LeadSink, LeadData, SinkResult, LeadSinkConfig } from './types.js';

export class WeComContactSink implements LeadSink {
  readonly sinkType = 'wecom_contact';

  async sync(lead: LeadData, config: LeadSinkConfig): Promise<SinkResult> {
    const { corpId, secret } = config;
    if (!corpId || !secret) {
      return { success: false, errorCode: 'MISSING_CONFIG', errorMessage: 'WeCom corpId and secret are required' };
    }

    try {
      const token = await this.getAccessToken(corpId, secret);
      if (!token) {
        return { success: false, errorCode: 'AUTH_FAILED', errorMessage: 'Failed to get WeCom access token' };
      }

      // Create external contact
      const resp = await fetch(
        'https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add?access_token=' + token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            external_userid: lead.id,
            name: lead.externalUserName || 'Unknown',
            remark: `Lead from ${lead.sourcePlatform} | Level: ${lead.level} | Intent: ${lead.intent || 'N/A'}`,
            description: lead.summary || '',
          }),
        },
      );

      const data = await resp.json() as Record<string, unknown>;

      if (data.errcode === 0) {
        return {
          success: true,
          externalId: (data.external_userid as string) || lead.id,
        };
      }

      // Already exists is OK
      if (data.errcode === 60111) {
        return {
          success: true,
          externalId: lead.id,
        };
      }

      return {
        success: false,
        errorCode: String(data.errcode),
        errorMessage: String(data.errmsg || 'WeCom API error'),
      };
    } catch (err) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  async testConnection(config: LeadSinkConfig): Promise<{ success: boolean; message: string }> {
    const { corpId, secret } = config;
    if (!corpId || !secret) {
      return { success: false, message: 'corpId and secret are required' };
    }

    try {
      const token = await this.getAccessToken(corpId, secret);
      if (token) return { success: true, message: 'WeCom connection successful' };
      return { success: false, message: 'Failed to authenticate with WeCom' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
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
