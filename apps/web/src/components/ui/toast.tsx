'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Types ---------- */
type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

/* ---------- Singleton state ---------- */
let addToast: ((type: ToastType, message: string) => void) | null = null;

/* ---------- Toast container (renders once at root) ---------- */
function ToastContainer() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    addToast = (type: ToastType, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
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
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((t) => {
        const Icon =
          t.type === 'success'
            ? CheckCircle
            : t.type === 'error'
              ? AlertCircle
              : Info;
        const colors =
          t.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : t.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-blue-200 bg-blue-50 text-blue-800';
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
            <button
              onClick={() => removeToast(t.id)}
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
  success: (message: string) => addToast?.('success', message),
  error: (message: string) => addToast?.('error', message),
  info: (message: string) => addToast?.('info', message)
};

export { ToastContainer, toast };
