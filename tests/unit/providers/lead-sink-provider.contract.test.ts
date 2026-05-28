import { describe, it, expect } from 'vitest';

interface TestConnectionResult {
  success: boolean;
  error?: string;
}

interface SyncLeadResult {
  success: boolean;
  externalId: string;
  externalUrl?: string;
  error?: string;
}

interface NotifyResult {
  success: boolean;
  error?: string;
}

interface LeadSinkProvider {
  readonly sinkType: string;
  testConnection(config: Record<string, unknown>): Promise<TestConnectionResult>;
  syncLead(input: { leadId: string; name: string; phone?: string; email?: string }, config: Record<string, unknown>): Promise<SyncLeadResult>;
  notify(input: { leadId: string; message: string }, config: Record<string, unknown>): Promise<NotifyResult>;
}

class SandboxLeadSinkProvider implements LeadSinkProvider {
  readonly sinkType: string;
  private syncedIds = new Map<string, string>();

  constructor(sinkType: string) {
    this.sinkType = sinkType;
  }

  async testConnection(config: Record<string, unknown>): Promise<TestConnectionResult> {
    if (!config.webhookUrl && !config.corpId) {
      return { success: false, error: 'Missing required config' };
    }
    return { success: true };
  }

  async syncLead(input: { leadId: string; name: string }, config: Record<string, unknown>): Promise<SyncLeadResult> {
    const existing = this.syncedIds.get(input.leadId);
    if (existing) {
      return { success: true, externalId: existing };
    }
    const extId = `${this.sinkType}_ext_${Date.now()}`;
    this.syncedIds.set(input.leadId, extId);
    return { success: true, externalId: extId, externalUrl: `https://${this.sinkType}.com/contact/${extId}` };
  }

  async notify(input: { leadId: string; message: string }, config: Record<string, unknown>): Promise<NotifyResult> {
    return { success: true };
  }
}

describe('LeadSinkProvider Contract', () => {
  const feishu = new SandboxLeadSinkProvider('feishu');
  const wecom = new SandboxLeadSinkProvider('wecom');
  const config = { webhookUrl: 'https://feishu.cn/webhook/test' };
  const wecomConfig = { corpId: 'corp_test', agentId: 'agent_test' };

  it('testConnection succeeds with valid config', async () => {
    const result = await feishu.testConnection(config);
    expect(result.success).toBe(true);
  });

  it('testConnection fails with missing config', async () => {
    const result = await feishu.testConnection({});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('syncLead returns externalId', async () => {
    const result = await feishu.syncLead({ leadId: 'lead1', name: 'Test' }, config);
    expect(result.success).toBe(true);
    expect(result.externalId).toContain('feishu_ext');
  });

  it('duplicate sync returns same externalId (idempotent)', async () => {
    const first = await feishu.syncLead({ leadId: 'lead2', name: 'Test' }, config);
    const second = await feishu.syncLead({ leadId: 'lead2', name: 'Test' }, config);
    expect(first.externalId).toBe(second.externalId);
  });

  it('notify returns success', async () => {
    const result = await feishu.notify({ leadId: 'lead1', message: 'New lead' }, config);
    expect(result.success).toBe(true);
  });

  it('wecom provider works similarly', async () => {
    const conn = await wecom.testConnection(wecomConfig);
    expect(conn.success).toBe(true);

    const result = await wecom.syncLead({ leadId: 'lead3', name: 'Wecom Test' }, wecomConfig);
    expect(result.success).toBe(true);
    expect(result.externalId).toContain('wecom_ext');
  });
});
