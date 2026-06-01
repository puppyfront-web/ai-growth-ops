'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

type NotificationBellProps = {
  hasUnread?: boolean;
  className?: string;
};

export function NotificationBell({ hasUnread = false, className }: NotificationBellProps) {
  return (
    <Button variant="ghost" size="icon" className={cn('relative', className)}>
      <Bell className="h-4 w-4" />
      {hasUnread && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
      )}
      <span className="sr-only">通知</span>
    </Button>
  );
}

function cn(...inputs: (string | undefined | false | null)[]) {
  return inputs.filter(Boolean).join(' ');
}
