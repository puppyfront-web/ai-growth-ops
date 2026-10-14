'use client';

import { useState, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogDestructiveAction
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** destructive 时主按钮为红色危险态 */
  variant?: 'default' | 'destructive';
}

/**
 * Hook that provides a confirm dialog replacement for window.confirm().
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   // To trigger:
 *   confirm({ title: '删除确认', description: '确定删除？', variant: 'destructive' })
 *     .then(ok => { if (ok) doDelete(); });
 *   // In JSX (render once):
 *   <ConfirmDialog />
 */
export function useConfirmDialog(defaultOptions?: ConfirmOptions) {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolver: ((value: boolean) => void) | null;
  }>({ open: false, options: {}, resolver: null });

  const confirm = useCallback(
    (opts?: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          options: { ...defaultOptions, ...opts },
          resolver: resolve
        });
      });
    },
    [defaultOptions]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        state.resolver?.(false);
        setState((prev) => ({ ...prev, open: false, resolver: null }));
      }
    },
    [state.resolver]
  );

  const handleConfirm = useCallback(() => {
    state.resolver?.(true);
    setState((prev) => ({ ...prev, open: false, resolver: null }));
  }, [state.resolver]);

  const isDestructive = state.options.variant === 'destructive';

  const ConfirmDialogComponent = (
    <AlertDialog open={state.open} onOpenChange={handleOpenChange}>
      <AlertDialogHeader>
        <AlertDialogTitle>{state.options.title ?? '确认操作'}</AlertDialogTitle>
        <AlertDialogDescription>
          {state.options.description ?? '此操作不可撤销。'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onOpenChange={handleOpenChange}>
          {state.options.cancelLabel ?? '取消'}
        </AlertDialogCancel>
        {isDestructive ? (
          <AlertDialogDestructiveAction
            onOpenChange={handleOpenChange}
            onClick={handleConfirm}
          >
            {state.options.confirmLabel ?? '确认删除'}
          </AlertDialogDestructiveAction>
        ) : (
          <AlertDialogAction
            onOpenChange={handleOpenChange}
            onClick={handleConfirm}
          >
            {state.options.confirmLabel ?? '确认'}
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
}
