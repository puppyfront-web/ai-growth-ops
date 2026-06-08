'use client';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const router = useRouter();

  return (
    <ChatPanel
      onThreadIdChange={(threadId) => {
        if (threadId) router.replace(`/chat/${threadId}`);
      }}
    />
  );
}
