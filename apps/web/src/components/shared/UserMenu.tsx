'use client';

import { LogOut, User } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { user, logout } = useAuth();

  const email = user?.email ?? '';
  const initials = email.slice(0, 1).toUpperCase() || 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent transition-colors outline-none">
          <Avatar className="h-8 w-8">
            <AvatarImage src="" alt={email} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user?.name ?? '用户'}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
            {email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          个人设置
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
