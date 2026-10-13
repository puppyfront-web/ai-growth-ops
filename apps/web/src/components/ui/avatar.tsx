'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
      className
    )}
    {...props}
  />
));
Avatar.displayName = 'Avatar';

/**
 * Renders nothing when src is missing or fails to load, so the fallback
 * (initials) below it stays visible instead of a broken-image icon.
 */
const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, alt = '', onError, ...props }, ref) => {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
      className={cn(
        'absolute inset-0 z-10 h-full w-full object-cover',
        className
      )}
      {...props}
    />
  );
});
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'absolute inset-0 flex items-center justify-center rounded-full bg-muted text-sm font-medium',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
