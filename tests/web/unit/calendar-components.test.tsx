import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { toDateKey, getDaysGrid } from '@/lib/utils';

describe('toDateKey', () => {
  it('formats a Date to YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 5, 15))).toBe('2026-06-15');
  });

  it('formats an ISO string to YYYY-MM-DD', () => {
    expect(toDateKey('2026-01-03T10:30:00Z')).toBe('2026-01-03');
  });

  it('pads month and day with zeros', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('getDaysGrid', () => {
  it('returns 42 cells', () => {
    const days = getDaysGrid(2026, 5); // June 2026
    expect(days).toHaveLength(42);
  });

  it('includes the first day of the month', () => {
    const days = getDaysGrid(2026, 5);
    const keys = days.map((d) => toDateKey(d));
    expect(keys).toContain('2026-06-01');
  });

  it('includes the last day of June 2026', () => {
    const days = getDaysGrid(2026, 5);
    const keys = days.map((d) => toDateKey(d));
    expect(keys).toContain('2026-06-30');
  });

  it('starts on Monday (June 2026 starts on Monday)', () => {
    const days = getDaysGrid(2026, 5);
    // June 1, 2026 is a Monday
    const firstOfMonth = days.find(
      (d) => d.getDate() === 1 && d.getMonth() === 5
    );
    expect(firstOfMonth).toBeDefined();
    expect(firstOfMonth!.getDay()).toBe(1); // Monday
  });
});

describe('CalendarDayCell', () => {
  const mockContentItem = {
    id: '1',
    title: '测试内容标题比较长需要截断',
    body: null,
    type: 'text_image' as const,
    status: 'draft' as const,
    userId: 'u1',
    projectId: 'p1',
    sourceType: null,
    sourceResearchTaskId: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    deletedAt: null,
    metadata: null,
    contentVariants: []
  };

  const mockPublishJob = {
    id: 'j1',
    userId: 'u1',
    contentVariantId: 'v1',
    platformAccountId: 'a1',
    platform: 'douyin' as const,
    contentType: 'text_image' as const,
    mode: 'official_api' as const,
    status: 'PUBLISHED' as const,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    externalPostId: null,
    externalUrl: null,
    lastError: null,
    retryCount: 0,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    deletedAt: null,
    metadata: null,
    contentVariant: {
      id: 'v1',
      title: '发布变体',
      platform: 'douyin',
      contentType: 'text_image',
      userId: 'u1',
      contentItemId: '1',
      body: null,
      tags: [],
      cta: null,
      mediaAssetIds: [],
      complianceStatus: 'approved' as const,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      metadata: null
    },
    platformAccount: {
      id: 'a1',
      userId: 'u1',
      platform: 'douyin',
      accountName: 'test',
      status: 'active' as const,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      cookie: null,
      metadata: null,
      createdAt: '',
      updatedAt: '',
      deletedAt: null
    },
    publishAttempts: []
  };

  it('renders content item label', () => {
    render(
      <CalendarDayCell items={[{ kind: 'content', item: mockContentItem }]} />
    );
    expect(screen.getByText('测试内容标题比较…')).toBeInTheDocument();
  });

  it('renders publish job label', () => {
    render(
      <CalendarDayCell items={[{ kind: 'publish', job: mockPublishJob }]} />
    );
    expect(screen.getByText('发布变体')).toBeInTheDocument();
  });

  it('renders overflow indicator', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      kind: 'content' as const,
      item: { ...mockContentItem, id: `c${i}`, title: `内容${i}` }
    }));
    render(<CalendarDayCell items={items} maxVisible={3} />);
    expect(screen.getByText('+2 更多')).toBeInTheDocument();
  });

  it('renders nothing for empty items', () => {
    const { container } = render(<CalendarDayCell items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('CalendarGrid', () => {
  it('renders legend items', () => {
    render(
      <CalendarGrid
        month={new Date(2026, 5, 1)}
        onMonthChange={() => {}}
        viewMode="month"
        onViewModeChange={() => {}}
        legendItems={[
          { label: '已发布', dotClass: 'bg-emerald-500' },
          { label: '失败', dotClass: 'bg-red-500' }
        ]}
        renderDayContent={() => null}
      />
    );
    expect(screen.getByText('已发布')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('renders view mode tabs', () => {
    render(
      <CalendarGrid
        month={new Date(2026, 5, 1)}
        onMonthChange={() => {}}
        viewMode="month"
        onViewModeChange={() => {}}
        legendItems={[]}
        renderDayContent={() => null}
      />
    );
    expect(screen.getByText('月视图')).toBeInTheDocument();
    expect(screen.getByText('周视图')).toBeInTheDocument();
  });
});
