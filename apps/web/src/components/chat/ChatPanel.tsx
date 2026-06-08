'use client';

import { useChat } from 'ai/react';
import { useCallback, useEffect, useRef } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { QuickActions } from './QuickActions';
import { getThread } from '@/lib/api/chat';

interface ChatPanelProps {
  threadId?: string;
  onThreadIdChange?: (threadId: string) => void;
}

export function ChatPanel({ threadId: initialThreadId, onThreadIdChange }: ChatPanelProps) {
  const currentThreadId = useRef(initialThreadId);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('current_org_id') || '' : '';

  const { messages, isLoading, append, setMessages } = useChat({
    api: '/api/chat',
    body: {
      threadId: currentThreadId.current,
      token,
      organizationId: orgId,
    },
    onResponse: (response) => {
      const newThreadId = response.headers.get('X-Thread-Id');
      if (newThreadId && !currentThreadId.current) {
        currentThreadId.current = newThreadId;
        onThreadIdChange?.(newThreadId);
      }
    },
  });

  // Load history for existing thread
  useEffect(() => {
    if (initialThreadId) {
      getThread(initialThreadId)
        .then((thread) => {
          if (thread.messages && thread.messages.length > 0) {
            setMessages(
              thread.messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
              })),
            );
          }
        })
        .catch(() => {});
    }
  }, [initialThreadId, setMessages]);

  const handleSend = useCallback(
    (content: string) => {
      append({ role: 'user', content });
    },
    [append],
  );

  const handleNewThread = useCallback(() => {
    currentThreadId.current = undefined;
    setMessages([]);
    onThreadIdChange?.(undefined as any);
  }, [setMessages, onThreadIdChange]);

  const handleSelectThread = useCallback(
    (id: string) => {
      window.location.href = `/chat/${id}`;
    },
    [],
  );

  return (
    <div className="flex h-full">
      <ChatSidebar
        activeThreadId={currentThreadId.current}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />
      <div className="flex flex-1 flex-col">
        {messages.length === 0 ? (
          <QuickActions onSelect={handleSend} />
        ) : (
          <MessageList messages={messages} />
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
