import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

describe('ConfirmDialog (legacy API)', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除确认"
        description="此操作不可撤销"
      />
    );
    expect(screen.getByText('删除确认')).toBeInTheDocument();
    expect(screen.getByText('此操作不可撤销')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="删除确认"
        description="此操作不可撤销"
      />
    );
    expect(screen.queryByText('删除确认')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="确认操作"
        description="确认吗？"
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange(false) when cancel clicked', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="确认操作"
        description="确认吗？"
      />
    );

    await user.click(screen.getByText('取消'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders destructive variant', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="删除"
        description="确认删除？"
        variant="destructive"
      />
    );
    expect(screen.getByText('确认删除')).toBeInTheDocument();
  });

  it('renders danger variant (legacy alias)', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="危险操作"
        description="确认？"
        variant="danger"
      />
    );
    expect(screen.getByText('确认删除')).toBeInTheDocument();
  });
});
