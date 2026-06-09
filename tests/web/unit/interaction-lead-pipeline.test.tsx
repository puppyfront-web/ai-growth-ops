import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadLevelBadge } from '@/components/shared/StatusBadge';
import { interactionTypeLabels, syncStatusLabels } from '@/lib/constants';

describe('interactionTypeLabels', () => {
  it('maps all interaction types to Chinese', () => {
    expect(interactionTypeLabels.comment).toBe('评论');
    expect(interactionTypeLabels.message).toBe('私信');
    expect(interactionTypeLabels.official_message).toBe('官方消息');
    expect(interactionTypeLabels.form_submission).toBe('表单提交');
  });
});

describe('syncStatusLabels', () => {
  it('maps all sync statuses to Chinese', () => {
    expect(syncStatusLabels.none).toBe('未同步');
    expect(syncStatusLabels.syncing).toBe('同步中');
    expect(syncStatusLabels.synced).toBe('已同步');
    expect(syncStatusLabels.failed).toBe('同步失败');
  });
});

describe('LeadLevelBadge in rules context', () => {
  it('renders all four levels used on rules page', () => {
    const levels = ['A', 'B', 'C', 'D'] as const;
    levels.forEach((level) => {
      const { unmount } = render(<LeadLevelBadge level={level} />);
      expect(screen.getByText(new RegExp(`${level}级`))).toBeInTheDocument();
      unmount();
    });
  });
});

describe('API client exports', () => {
  it('conversations API exports classifyInteraction', async () => {
    const mod = await import('@/lib/api/conversations');
    expect(typeof mod.classifyInteraction).toBe('function');
  });

  it('conversations API exports suggestReply', async () => {
    const mod = await import('@/lib/api/conversations');
    expect(typeof mod.suggestReply).toBe('function');
  });

  it('conversations API exports convertToLead', async () => {
    const mod = await import('@/lib/api/conversations');
    expect(typeof mod.convertToLead).toBe('function');
  });

  it('conversations API exports ignoreInteraction', async () => {
    const mod = await import('@/lib/api/conversations');
    expect(typeof mod.ignoreInteraction).toBe('function');
  });

  it('leads API exports getLeadSinkConfig', async () => {
    const mod = await import('@/lib/api/leads');
    expect(typeof mod.getLeadSinkConfig).toBe('function');
  });

  it('leads API exports updateLeadSinkConfig', async () => {
    const mod = await import('@/lib/api/leads');
    expect(typeof mod.updateLeadSinkConfig).toBe('function');
  });
});

describe('query keys', () => {
  it('has conversations.replies key', async () => {
    const mod = await import('@/lib/query-keys');
    expect(mod.queryKeys.conversations.replies).toBeDefined();
    expect(mod.queryKeys.conversations.replies).toEqual([
      'conversations',
      'replies'
    ]);
  });

  it('has leads.sinks key', async () => {
    const mod = await import('@/lib/query-keys');
    expect(mod.queryKeys.leads.sinks('feishu')).toEqual([
      'leads',
      'sinks',
      'feishu'
    ]);
    expect(mod.queryKeys.leads.sinks('wecom')).toEqual([
      'leads',
      'sinks',
      'wecom'
    ]);
  });
});
