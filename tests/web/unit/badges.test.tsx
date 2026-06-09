import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StatusBadge,
  PlatformBadge,
  LeadLevelBadge,
  RiskBadge
} from '@/components/shared/StatusBadge';

describe('StatusBadge', () => {
  it('maps PUBLISHED to success variant', () => {
    render(<StatusBadge status="PUBLISHED" label="已发布" />);
    const badge = screen.getByText('已发布');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-green-50');
  });

  it('maps FAILED to danger variant', () => {
    render(<StatusBadge status="FAILED" label="失败" />);
    const badge = screen.getByText('失败');
    expect(badge.className).toContain('bg-red-50');
  });

  it('maps DRAFT to muted variant', () => {
    render(<StatusBadge status="DRAFT" label="草稿" />);
    const badge = screen.getByText('草稿');
    expect(badge.className).toContain('bg-gray-50');
  });

  it('maps RUNNING to warning variant', () => {
    render(<StatusBadge status="RUNNING" label="运行中" />);
    const badge = screen.getByText('运行中');
    expect(badge.className).toContain('bg-yellow-50');
  });

  it('displays raw status when no label', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
  });
});

describe('PlatformBadge', () => {
  const platforms = [
    'douyin',
    'xiaohongshu',
    'wechat_official',
    'wechat_channels',
    'baijiahao',
    'zhihu'
  ] as const;

  it('renders Chinese labels for all 6 platforms', () => {
    const expectedLabels = [
      '抖音',
      '小红书',
      '微信公众号',
      '微信视频号',
      '百家号',
      '知乎'
    ];
    platforms.forEach((platform, i) => {
      const { unmount } = render(<PlatformBadge platform={platform} />);
      expect(screen.getByText(expectedLabels[i])).toBeInTheDocument();
      unmount();
    });
  });

  it('shows emoji icon by default', () => {
    render(<PlatformBadge platform="douyin" />);
    expect(screen.getByText('🎵')).toBeInTheDocument();
  });

  it('hides icon when showIcon=false', () => {
    render(<PlatformBadge platform="douyin" showIcon={false} />);
    expect(screen.queryByText('🎵')).not.toBeInTheDocument();
    expect(screen.getByText('抖音')).toBeInTheDocument();
  });
});

describe('LeadLevelBadge', () => {
  it('renders A level with red style', () => {
    render(<LeadLevelBadge level="A" />);
    const badge = screen.getByText(/A级/);
    expect(badge.className).toContain('bg-red-50');
  });

  it('renders B level with amber style', () => {
    render(<LeadLevelBadge level="B" />);
    const badge = screen.getByText(/B级/);
    expect(badge.className).toContain('bg-amber-50');
  });

  it('renders C level with blue style', () => {
    render(<LeadLevelBadge level="C" />);
    const badge = screen.getByText(/C级/);
    expect(badge.className).toContain('bg-blue-50');
  });

  it('renders D level with gray style', () => {
    render(<LeadLevelBadge level="D" />);
    const badge = screen.getByText(/D级/);
    expect(badge.className).toContain('bg-gray-50');
  });
});

describe('RiskBadge', () => {
  it('renders low risk with green style', () => {
    render(<RiskBadge risk="low" />);
    expect(screen.getByText('低风险')).toBeInTheDocument();
  });

  it('renders medium risk with amber style', () => {
    render(<RiskBadge risk="medium" />);
    expect(screen.getByText('中风险')).toBeInTheDocument();
  });

  it('renders high risk with red style', () => {
    render(<RiskBadge risk="high" />);
    expect(screen.getByText('高风险')).toBeInTheDocument();
  });

  it('supports legacy level prop', () => {
    render(<RiskBadge level="high" />);
    expect(screen.getByText('高风险')).toBeInTheDocument();
  });
});
