import { describe, expect, it } from 'vitest';
import {
  customerToFeishuLeadData,
  extractPlaybookNextAction
} from '../../../packages/database/src/customer-feishu-sync.js';

describe('customerToFeishuLeadData', () => {
  it('maps CRM fields for bitable sync', () => {
    const payload = customerToFeishuLeadData({
      id: 'cust-1',
      organizationId: 'org',
      userId: 'user',
      displayName: '张三',
      phone: '13800138000',
      company: 'ACME',
      role: '采购',
      intent: '需要企业版报价',
      channel: 'douyin',
      sourceNote: '关键词获客',
      status: 'active',
      assignedTo: null,
      fitScore: 70,
      intentScore: 80,
      healthScore: 90,
      segment: 'hot',
      tags: ['获客转入'],
      metadata: { leadLevel: 'A' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null
    });

    expect(payload.externalUserName).toBe('张三');
    expect(payload.sourcePlatform).toBe('抖音');
    expect(payload.level).toBe('A');
    expect(payload.phone).toBe('13800138000');
    expect(payload.nextAction).toBe('hot');
  });

  it('extracts the first pending playbook action as nextAction', () => {
    expect(
      extractPlaybookNextAction([
        { status: 'done', title: '已完成' },
        { status: 'pending', title: '电话确认需求' }
      ])
    ).toBe('电话确认需求');
    expect(extractPlaybookNextAction([])).toBeUndefined();
  });
});
