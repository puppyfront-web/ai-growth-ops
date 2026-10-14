'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type CheckboxProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> & {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
};

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    { checked = false, onCheckedChange, disabled, className, ...props },
    ref
  ) => {
    const isChecked = checked === true;
    const isIndeterminate = checked === 'indeterminate';
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={isIndeterminate ? 'mixed' : isChecked}
        disabled={disabled}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          (isChecked || isIndeterminate) &&
            'bg-primary text-primary-foreground',
          className
        )}
        onClick={() => onCheckedChange?.(!isChecked)}
        {...props}
      >
        {isChecked && <Check className="h-3 w-3" aria-hidden />}
        {isIndeterminate && <Minus className="h-3 w-3" aria-hidden />}
      </button>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
