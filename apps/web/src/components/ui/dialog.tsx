'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------- Context ---------- */
type DialogCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const DialogContext = React.createContext<DialogCtx>({
  open: false,
  setOpen: () => {}
});

/* ---------- Dialog root ---------- */
type DialogProps = {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function Dialog({
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  children
}: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (onOpenChange) onOpenChange(v);
      else setInternalOpen(v);
    },
    [onOpenChange]
  );

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

/* ---------- Trigger ---------- */
function DialogTrigger({
  children,
  asChild = false,
  className
}: {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
}) {
  const { setOpen } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        onClick: () => setOpen(true),
        className: cn(
          (children.props as Record<string, unknown>)?.className as
            | string
            | undefined,
          className
        )
      }
    );
  }
  return (
    <button onClick={() => setOpen(true)} className={className}>
      {children}
    </button>
  );
}

/* ---------- Overlay ---------- */
function DialogOverlay({ className }: { className?: string }) {
  const { setOpen } = React.useContext(DialogContext);
  return (
    <div
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      onClick={() => setOpen(false)}
    />
  );
}

/* ---------- Content ---------- */
type DialogContentProps = {
  children: React.ReactNode;
  className?: string;
};

function DialogContent({ children, className }: DialogContentProps) {
  const { open, setOpen } = React.useContext(DialogContext);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <DialogOverlay />
      <div
        className={cn(
          'relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Header / Title / Description / Footer ---------- */
function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4',
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
};
