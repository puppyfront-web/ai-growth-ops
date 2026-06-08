'use client';

import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from 'ai/react';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          role={msg.role as 'user' | 'assistant' | 'system' | 'tool'}
          content={msg.content}
          toolInvocations={(msg as any).toolInvocations}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
