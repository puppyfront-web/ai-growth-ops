import type { LeadSink, LeadData, SinkResult, LeadSinkConfig } from './types.js';

export class FeishuBitableSink implements LeadSink {
  readonly sinkType = 'feishu_bitable';

  async sync(lead: LeadData, config: LeadSinkConfig): Promise<SinkResult> {
    const { appId, appSecret, appToken, tableId } = config;
    if (!appToken || !tableId) {
      return { success: false, errorCode: 'MISSING_CONFIG', errorMessage: 'Feishu appToken and tableId are required' };
    }

    try {
      const token = await this.getTenantToken(appId, appSecret);
      if (!token) {
        return { success: false, errorCode: 'AUTH_FAILED', errorMessage: 'Failed to get Feishu tenant token' };
      }

      const fieldMapping = config.fieldMapping || this.defaultFieldMapping();
      const fields: Record<string, unknown> = {};
      for (const [leadField, bitableField] of Object.entries(fieldMapping)) {
        const value = lead[leadField];
        if (value != null) fields[bitableField] = value;
      }

      const resp = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ fields }),
        },
      );

      const data = await resp.json() as Record<string, unknown>;

      if (data.code !== 0) {
        return {
          success: false,
          errorCode: String(data.code),
          errorMessage: String(data.msg || 'Feishu API error'),
        };
      }

      const record = (data.data as Record<string, unknown>)?.record as Record<string, unknown> | undefined;
      return {
        success: true,
        externalId: record?.record_id as string | undefined,
        externalUrl: `https://feishu.cn/base/${appToken}?table=${tableId}`,
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
    const { appId, appSecret, appToken, tableId } = config;
    if (!appToken || !tableId) {
      return { success: false, message: 'appToken and tableId are required' };
    }

    try {
      const token = await this.getTenantToken(appId, appSecret);
      if (!token) return { success: false, message: 'Failed to authenticate with Feishu' };

      const resp = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        { headers: { 'Authorization': `Bearer ${token}` } },
      );

      const data = await resp.json() as Record<string, unknown>;
      if (data.code === 0) {
        return { success: true, message: 'Feishu Bitable connection successful' };
      }
      return { success: false, message: String(data.msg || 'Connection failed') };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  private defaultFieldMapping(): Record<string, string> {
    return {
      'id': 'lead_id',
      'sourcePlatform': 'source_platform',
      'externalUserName': 'customer_name',
      'level': 'lead_level',
      'intent': 'intent',
      'summary': 'summary',
      'assignedTo': 'assigned_to',
      'nextAction': 'next_action',
      'riskLevel': 'risk_level',
      'createdAt': 'created_at',
    };
  }

  private async getTenantToken(appId?: string, appSecret?: string): Promise<string | null> {
    if (!appId || !appSecret) return null;
    try {
      const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
      const data = await resp.json() as Record<string, unknown>;
      return (data.tenant_access_token as string) || null;
    } catch {
      return null;
    }
  }
}
