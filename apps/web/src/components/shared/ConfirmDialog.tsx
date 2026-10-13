'use client';

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

/**
 * 声明式确认对话框（legacy props 形态）。
 * 命令式用法请使用 hooks/useConfirmDialog（{ confirm, ConfirmDialog }）。
 */
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'danger' | 'normal';
  onConfirm?: () => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;

  const isDestructive =
    props.variant === 'destructive' || props.variant === 'danger';

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogHeader>
        <AlertDialogTitle>{props.title}</AlertDialogTitle>
        <AlertDialogDescription>{props.description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onOpenChange={() => props.onOpenChange(false)}>
          {props.cancelLabel ?? '取消'}
        </AlertDialogCancel>
        {isDestructive ? (
          <AlertDialogDestructiveAction
            onOpenChange={() => props.onOpenChange(false)}
            onClick={() => {
              props.onConfirm?.();
              props.onOpenChange(false);
            }}
          >
            {props.confirmLabel ?? '确认删除'}
          </AlertDialogDestructiveAction>
        ) : (
          <AlertDialogAction
            onOpenChange={() => props.onOpenChange(false)}
            onClick={() => {
              props.onConfirm?.();
              props.onOpenChange(false);
            }}
          >
            {props.confirmLabel ?? '确认'}
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </AlertDialog>
  );
}
