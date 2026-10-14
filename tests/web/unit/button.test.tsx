import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>点击</Button>);
    const btn = screen.getByRole('button', { name: '点击' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-primary');
  });

  it('renders with destructive variant', () => {
    render(<Button variant="destructive">删除</Button>);
    const btn = screen.getByRole('button', { name: '删除' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-destructive');
  });

  it('renders with outline variant', () => {
    render(<Button variant="outline">取消</Button>);
    const btn = screen.getByRole('button', { name: '取消' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('border');
  });

  it('renders ghost-destructive variant', () => {
    render(<Button variant="ghost-destructive">删除</Button>);
    const btn = screen.getByRole('button', { name: '删除' });
    expect(btn.className).toContain('text-destructive');
  });

  it('renders as disabled', () => {
    render(<Button disabled>禁用</Button>);
    const btn = screen.getByRole('button', { name: '禁用' });
    expect(btn).toBeDisabled();
  });

  it('loading state disables the button and shows a spinner', () => {
    render(<Button loading>保存</Button>);
    const btn = screen.getByRole('button', { name: /保存/ });
    expect(btn).toBeDisabled();
    // spinner svg rendered alongside the label
    expect(btn.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('renders as a link when asChild with anchor child', () => {
    render(
      <Button asChild>
        <a href="/content/new">新建内容</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: '新建内容' });
    expect(link).toHaveAttribute('href', '/content/new');
    expect(link.className).toContain('bg-primary');
  });

  it('supports xs size', () => {
    render(<Button size="xs">小按钮</Button>);
    const btn = screen.getByRole('button', { name: '小按钮' });
    expect(btn.className).toContain('h-7');
  });
});
