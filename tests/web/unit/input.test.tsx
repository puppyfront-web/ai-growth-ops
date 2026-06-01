import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders input element', () => {
    render(<Input placeholder="请输入" />);
    const input = screen.getByPlaceholderText('请输入');
    expect(input).toBeInTheDocument();
  });

  it('applies error styles via className', () => {
    render(<Input className="border-destructive" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-destructive');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
