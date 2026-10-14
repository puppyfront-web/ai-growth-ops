'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Types ---------- */
type ToastType = 'success' | 'error' | 'info';

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
};

type ToastOptions = {
  /** 内联操作按钮（如「撤销」），点击后关闭该条 */
  action?: ToastAction;
  /** 展示时长，默认 4000ms；带 action 的默认 6000ms */
  duration?: number;
};

/* ---------- Singleton state ---------- */
type AddToast = (type: ToastType, message: string, options?: ToastOptions) => void;

let addToast: AddToast | null = null;

/* ---------- Toast container (renders once at root) ---------- */
function ToastContainer() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    addToast = (type: ToastType, message: string, options?: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [
        ...prev,
        { id, type, message, action: options?.action }
      ]);
      setTimeout(
        () => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        },
        options?.duration ?? (options?.action ? 6000 : 4000)
      );
    };
    return () => {
      addToast = null;
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => {
        const Icon =
          t.type === 'success'
            ? CheckCircle
            : t.type === 'error'
              ? AlertCircle
              : Info;
        const colors =
          t.type === 'success'
            ? 'border-success/25 bg-success/10 text-success'
            : t.type === 'error'
              ? 'border-destructive/25 bg-destructive/10 text-destructive'
              : 'border-info/25 bg-info/10 text-info';
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 shadow-lg animate-in slide-in-from-bottom-5 fade-in-0',
              colors
            )}
          >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
                className="shrink-0 text-sm font-medium underline underline-offset-2 hover:opacity-80"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(t.id)}
              aria-label="关闭提示"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

/* ---------- Public API ---------- */
const toast = {
  success: (message: string, options?: ToastOptions) =>
    addToast?.('success', message, options),
  error: (message: string, options?: ToastOptions) =>
    addToast?.('error', message, options),
  info: (message: string, options?: ToastOptions) =>
    addToast?.('info', message, options)
};

export { ToastContainer, toast };
export type { ToastOptions, ToastAction };
