'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type TooltipContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const TooltipContext = React.createContext<TooltipContextValue>({
  open: false,
  setOpen: () => {}
});

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      {children}
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({
  children,
  asChild
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = React.useContext(TooltipContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false)
      }
    );
  }

  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="inline-block"
    >
      {children}
    </div>
  );
}

type TooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: 'top' | 'bottom' | 'left' | 'right';
};

function TooltipContent({
  className,
  children,
  side = 'top',
  ...props
}: TooltipContentProps) {
  const { open } = React.useContext(TooltipContext);
  if (!open) return null;

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div
      className={cn(
        'absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        positionClasses[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
