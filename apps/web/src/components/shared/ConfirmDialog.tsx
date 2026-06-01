'use client';

import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogDestructiveAction,
} from '@/components/ui/alert-dialog';
import { useConfirmDialog as useConfirmDialogHook } from '@/hooks/use-confirm-dialog';

/* ---------- Hook-based usage (new pattern) ---------- */

type ConfirmDialogHookProps = ReturnType<typeof useConfirmDialogHook>;

export function ConfirmDialog(props: ConfirmDialogHookProps | ConfirmDialogLegacyProps) {
  // Hook-based usage: { confirm, dialog, handleConfirm, handleCancel }
  if ('dialog' in props && 'handleConfirm' in props) {
    const { dialog, handleConfirm, handleCancel } = props as ConfirmDialogHookProps;
    if (!dialog) return null;

    const isDestructive = dialog.variant === 'destructive';

    return (
      <AlertDialog open={!!dialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
          <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onOpenChange={handleCancel}>
            {dialog.cancelLabel ?? '取消'}
          </AlertDialogCancel>
          {isDestructive ? (
            <AlertDialogDestructiveAction onOpenChange={handleConfirm} onClick={handleConfirm}>
              {dialog.confirmLabel ?? '确认删除'}
            </AlertDialogDestructiveAction>
          ) : (
            <AlertDialogAction onOpenChange={handleConfirm} onClick={handleConfirm}>
              {dialog.confirmLabel ?? '确认'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialog>
    );
  }

  // Legacy usage: { open, onOpenChange, title, description, ... }
  const legacy = props as ConfirmDialogLegacyProps;
  if (!legacy.open) return null;

  const isDestructive = legacy.variant === 'destructive' || legacy.variant === 'danger';

  return (
    <AlertDialog open={legacy.open} onOpenChange={legacy.onOpenChange}>
      <AlertDialogHeader>
        <AlertDialogTitle>{legacy.title}</AlertDialogTitle>
        <AlertDialogDescription>{legacy.description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onOpenChange={() => legacy.onOpenChange(false)}>
          {legacy.cancelLabel ?? '取消'}
        </AlertDialogCancel>
        {isDestructive ? (
          <AlertDialogDestructiveAction
            onOpenChange={() => legacy.onOpenChange(false)}
            onClick={() => { legacy.onConfirm?.(); legacy.onOpenChange(false); }}
          >
            {legacy.confirmLabel ?? '确认删除'}
          </AlertDialogDestructiveAction>
        ) : (
          <AlertDialogAction
            onOpenChange={() => legacy.onOpenChange(false)}
            onClick={() => { legacy.onConfirm?.(); legacy.onOpenChange(false); }}
          >
            {legacy.confirmLabel ?? '确认'}
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </AlertDialog>
  );
}

/* ---------- Legacy props (old pages) ---------- */

type ConfirmDialogLegacyProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'danger' | 'normal';
  onConfirm?: () => void;
};
