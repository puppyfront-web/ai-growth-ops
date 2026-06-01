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

  it('renders as disabled', () => {
    render(<Button disabled>禁用</Button>);
    const btn = screen.getByRole('button', { name: '禁用' });
    expect(btn).toBeDisabled();
  });
});
