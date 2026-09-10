import { describe, it, expect } from 'vitest';
import {
  buildRuleBasedPlaybook,
  normalizeSkillPlaybookActions,
  canTransitionPlaybookStatus,
  isPlaybookDueOverdue
} from '../../../packages/shared/src/customer-playbook';

describe('buildRuleBasedPlaybook', () => {
  const baseInput = {
    displayName: '张三',
    company: '某某科技',
    role: '采购经理',
    intent: '想了解企业版价格和演示',
    channel: 'exhibition',
    status: 'active',
    segment: 'hot' as const,
    fitScore: 80,
    intentScore: 85,
    healthScore: 90,
    profileSummary: '高意向采购负责人',
    painPoints: ['成本管控'],
    interests: ['SaaS'],
    recentActivities: []
  };

  it('generates hot segment actions with call and meeting', () => {
    const result = buildRuleBasedPlaybook(baseInput);
    expect(result.summary).toContain('某某科技');
    expect(result.actions.length).toBeGreaterThanOrEqual(3);
    expect(result.actions.some((a) => a.type === 'call')).toBe(true);
    expect(result.actions.every((a) => a.id && a.status === 'pending')).toBe(
      true
    );
  });

  it('generates nurture actions for cold segment', () => {
    const result = buildRuleBasedPlaybook({ ...baseInput, segment: 'cold' });
    expect(result.actions.some((a) => a.type === 'send_material')).toBe(true);
    expect(result.actions.every((a) => a.priority === 'low')).toBe(true);
  });

  it('normalizes skill actions with ids and due dates', () => {
    const actions = normalizeSkillPlaybookActions([
      {
        type: 'call',
        title: '电话',
        content: '联系客户',
        dueInDays: 1,
        priority: 'high'
      }
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBeTruthy();
    expect(actions[0].dueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isPlaybookDueOverdue', () => {
  it('treats date-only dueAt as overdue after that local day', () => {
    const now = new Date(2026, 8, 7, 7, 12);
    expect(isPlaybookDueOverdue('2026-09-06', now)).toBe(true);
    expect(isPlaybookDueOverdue('2026-09-07', now)).toBe(false);
    expect(isPlaybookDueOverdue('2026-09-08', now)).toBe(false);
  });

  it('compares timestamps for ISO dueAt', () => {
    const now = new Date('2026-09-07T00:30:00.000Z');
    expect(isPlaybookDueOverdue('2026-09-06T00:00:00.000Z', now)).toBe(true);
    expect(isPlaybookDueOverdue('2026-09-07T01:00:00.000Z', now)).toBe(false);
  });
});

describe('canTransitionPlaybookStatus', () => {
  it('requires approval to activate a draft', () => {
    expect(canTransitionPlaybookStatus('draft', 'active')).toBe(false);
    expect(canTransitionPlaybookStatus('draft', 'cancelled')).toBe(true);
    expect(canTransitionPlaybookStatus('active', 'completed')).toBe(true);
    expect(canTransitionPlaybookStatus('completed', 'active')).toBe(false);
  });
});
