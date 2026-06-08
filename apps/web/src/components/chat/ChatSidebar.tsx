'use client';

import { useEffect, useState } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listThreads, type ChatThread } from '@/lib/api/chat';
import { cn } from '@/lib/utils';

interface ChatSidebarProps {
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function ChatSidebar({ activeThreadId, onSelectThread, onNewThread }: ChatSidebarProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  useEffect(() => {
    listThreads().then(setThreads).catch(() => {});
  }, [activeThreadId]);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="p-3">
        <Button
          onClick={onNewThread}
          variant="outline"
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          新对话
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {threads.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              thread.id === activeThreadId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate">{thread.title || '新对话'}</span>
          </button>
        ))}
      </div>
      <div className="border-t p-3">
        <a
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
        >
          📊 Dashboard
        </a>
      </div>
    </div>
  );
}
