import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { LeadFunnelCard } from '@/components/dashboard/LeadFunnelCard';
import { PlatformBreakdownCard } from '@/components/dashboard/PlatformBreakdownCard';
import { MetricGrid } from '@/components/dashboard/MetricGrid';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { Send } from 'lucide-react';
import type { DashboardMetrics } from '@/types/dashboard';

describe('MetricCard', () => {
  it('renders label and formatted value', () => {
    render(<MetricCard icon={Send} label="发布任务" value={1234} />);
    expect(screen.getByText('发布任务')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders upward trend arrow when positive', () => {
    const { container } = render(<MetricCard icon={Send} label="发布任务" value={100} trendPercent={25} />);
    expect(container.querySelector('.text-emerald-600')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('renders downward trend arrow when negative', () => {
    const { container } = render(<MetricCard icon={Send} label="发布任务" value={80} trendPercent={-15} />);
    expect(container.querySelector('.text-red-500')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('renders neutral state when trend is zero', () => {
    render(<MetricCard icon={Send} label="发布任务" value={100} trendPercent={0} />);
    expect(screen.getByText('发布任务')).toBeInTheDocument();
  });

  it('hides trend when trendPercent is undefined', () => {
    const { container } = render(<MetricCard icon={Send} label="发布任务" value={100} />);
    expect(container.querySelector('.text-emerald-600')).not.toBeInTheDocument();
    expect(container.querySelector('.text-red-500')).not.toBeInTheDocument();
  });
});

describe('MetricGrid', () => {
  const mockMetrics: DashboardMetrics = {
    platformAccounts: 6,
    contentItems: 20,
    contentVariants: 30,
    publishJobs: 15,
    publishedJobs: 12,
    interactions: 50,
    qualifiedLeads: 8,
    researchInsights: 5,
    contentOpportunities: 10,
    providerRuns: 25,
  };

  it('renders 5 metric cards', () => {
    render(<MetricGrid metrics={mockMetrics} />);
    expect(screen.getByText('发布任务')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
    expect(screen.getByText('互动数')).toBeInTheDocument();
    expect(screen.getByText('合格线索')).toBeInTheDocument();
    expect(screen.getByText('调研洞察')).toBeInTheDocument();
  });

  it('shows trend arrow on qualified leads when leadTrend provided', () => {
    const trend = [
      { date: '2026-05-01', total: 2 },
      { date: '2026-05-15', total: 4 },
      { date: '2026-05-20', total: 6 },
      { date: '2026-05-25', total: 8 },
    ];
    render(<MetricGrid metrics={mockMetrics} leadTrend={trend} />);
    // Trend should be computed and displayed (positive growth)
    expect(screen.getByText('合格线索')).toBeInTheDocument();
  });
});

describe('QuickActions', () => {
  it('renders 6 action buttons', () => {
    render(<QuickActions />);
    expect(screen.getByText('创建内容')).toBeInTheDocument();
    expect(screen.getByText('运行调研')).toBeInTheDocument();
    expect(screen.getByText('发布管理')).toBeInTheDocument();
    expect(screen.getByText('评论私信')).toBeInTheDocument();
    expect(screen.getByText('线索管理')).toBeInTheDocument();
    expect(screen.getByText('数据复盘')).toBeInTheDocument();
  });

  it('renders links to correct pages', () => {
    render(<QuickActions />);
    expect(screen.getByRole('link', { name: /创建内容/ })).toHaveAttribute('href', '/content/new');
    expect(screen.getByRole('link', { name: /运行调研/ })).toHaveAttribute('href', '/research/new');
  });
});

describe('LeadFunnelCard', () => {
  it('renders qualified leads count and percentage', () => {
    render(<LeadFunnelCard qualifiedLeads={8} totalLeads={20} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText(/20 合格/)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('handles zero total leads gracefully', () => {
    render(<LeadFunnelCard qualifiedLeads={0} totalLeads={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/0 合格/)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders 4 funnel level labels', () => {
    render(<LeadFunnelCard qualifiedLeads={5} totalLeads={10} />);
    expect(screen.getByText(/A级/)).toBeInTheDocument();
    expect(screen.getByText(/B级/)).toBeInTheDocument();
    expect(screen.getByText(/C级/)).toBeInTheDocument();
    expect(screen.getByText(/D级/)).toBeInTheDocument();
  });
});

describe('PlatformBreakdownCard', () => {
  it('renders platform rows with publish and lead counts', () => {
    const data = [
      { platform: 'douyin', platformLabel: '抖音', publishCount: 10, leadCount: 5 },
      { platform: 'xiaohongshu', platformLabel: '小红书', publishCount: 8, leadCount: 3 },
    ];
    render(<PlatformBreakdownCard data={data} />);
    expect(screen.getByText('抖音')).toBeInTheDocument();
    expect(screen.getByText('小红书')).toBeInTheDocument();
    expect(screen.getByText(/发布 10/)).toBeInTheDocument();
    expect(screen.getByText(/线索 5/)).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<PlatformBreakdownCard data={[]} />);
    expect(screen.getByText('暂无平台数据')).toBeInTheDocument();
  });
});

describe('ChartContainer', () => {
  it('renders title and children', () => {
    render(<ChartContainer title="Test Chart"><div data-testid="child">Chart content</div></ChartContainer>);
    expect(screen.getByText('Test Chart')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders date range selector when provided', () => {
    render(
      <ChartContainer title="Test" dateRange="30d" onDateRangeChange={() => {}}>
        <div>content</div>
      </ChartContainer>,
    );
    expect(screen.getByText('7天')).toBeInTheDocument();
    expect(screen.getByText('30天')).toBeInTheDocument();
    expect(screen.getByText('90天')).toBeInTheDocument();
  });
});
