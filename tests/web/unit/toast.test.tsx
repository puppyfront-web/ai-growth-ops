import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer, toast } from '@/components/ui/toast';

describe('ToastContainer + toast', () => {
  it('renders a success toast with message', async () => {
    render(<ToastContainer />);
    act(() => {
      toast.success('已保存');
    });
    expect(await screen.findByText('已保存')).toBeInTheDocument();
  });

  it('renders an action button that fires onClick and dismisses', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<ToastContainer />);
    act(() => {
      toast.success('已删除草稿', { action: { label: '撤销', onClick: onUndo } });
    });
    const undo = await screen.findByText('撤销');
    await user.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('已删除草稿')).not.toBeInTheDocument();
    });
  });

  it('renders error toast with error styling', async () => {
    render(<ToastContainer />);
    act(() => {
      toast.error('保存失败，请重试');
    });
    const el = await screen.findByText('保存失败，请重试');
    expect(el.closest('div[class*="border-destructive"]')).not.toBeNull();
  });
});
