import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';

describe('Dialog', () => {
  it('does not render content when closed', () => {
    render(
      <Dialog>
        <DialogTrigger>打开</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标题</DialogTitle>
            <DialogDescription>描述</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText('标题')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>测试弹窗</DialogTitle>
            <DialogDescription>弹窗描述</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText('测试弹窗')).toBeInTheDocument();
    expect(screen.getByText('弹窗描述')).toBeInTheDocument();
  });

  it('closes when clicking the close button', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>可关闭弹窗</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText('可关闭弹窗')).toBeInTheDocument();
    // Find the X close button (rendered as a button with X icon inside the dialog content)
    const closeButtons = document.querySelectorAll('button');
    const xButton = Array.from(closeButtons).find((btn) => {
      const svg = btn.querySelector('svg');
      return svg && btn.getAttribute('class')?.includes('absolute');
    });
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(screen.queryByText('可关闭弹窗')).not.toBeInTheDocument();
  });
});
