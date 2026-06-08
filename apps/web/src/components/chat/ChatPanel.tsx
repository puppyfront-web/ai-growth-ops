'use client';

import { useChat } from 'ai/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { QuickActions } from './QuickActions';
import { getThread } from '@/lib/api/chat';
import { authToken, currentOrg } from '@/lib/api/client';

interface ChatPanelProps {
  threadId?: string;
  onThreadIdChange?: (threadId: string | undefined) => void;
}

export function ChatPanel({ threadId: initialThreadId, onThreadIdChange }: ChatPanelProps) {
  const [activeThreadId, setActiveThreadId] = useState(initialThreadId);
  const token = authToken.get() || '';
  const orgId = currentOrg.get() || '';

  const { messages, isLoading, append, setMessages } = useChat({
    api: '/api/chat',
    body: {
      threadId: activeThreadId,
      token,
      organizationId: orgId,
    },
    onResponse: (response) => {
      const newThreadId = response.headers.get('X-Thread-Id');
      if (newThreadId && !activeThreadId) {
        setActiveThreadId(newThreadId);
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
    setActiveThreadId(undefined);
    setMessages([]);
    onThreadIdChange?.(undefined);
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
        activeThreadId={activeThreadId}
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
