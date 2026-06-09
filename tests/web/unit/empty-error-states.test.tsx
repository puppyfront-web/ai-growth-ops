import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';

describe('EmptyState', () => {
  it('renders default empty message', () => {
    render(<EmptyState />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('renders custom title and description', () => {
    render(<EmptyState title="还没有内容" description="从选题开始创建" />);
    expect(screen.getByText('还没有内容')).toBeInTheDocument();
    expect(screen.getByText('从选题开始创建')).toBeInTheDocument();
  });

  it('renders action link when provided', () => {
    render(
      <EmptyState title="空" action={{ label: '新建', href: '/content/new' }} />
    );
    const link = screen.getByText('新建');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')?.getAttribute('href')).toBe('/content/new');
  });
});

describe('ErrorState', () => {
  it('renders error message', () => {
    render(<ErrorState message="加载失败，请重试" />);
    expect(screen.getByText(/加载失败/)).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    render(<ErrorState message="错误" onRetry={() => {}} />);
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('does not render retry button when no onRetry', () => {
    render(<ErrorState message="错误" />);
    expect(screen.queryByText('重试')).not.toBeInTheDocument();
  });
});
