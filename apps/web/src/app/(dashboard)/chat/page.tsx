'use client';

import { AssistantProvider } from '@/components/chat/AssistantProvider';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ChatThreadListPage() {
  const router = useRouter();
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      <ChatSidebar
        activeThreadId={activeThreadId}
        onSelectThread={(id) => router.push(`/chat/${id}`)}
        onNewThread={() => {
          setActiveThreadId(undefined);
          router.push('/chat');
        }}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AssistantProvider
          threadId={activeThreadId}
          onThreadIdChange={(id) => {
            if (id) {
              setActiveThreadId(id);
              router.replace(`/chat/${id}`);
            }
          }}
        />
      </div>
    </div>
  );
}
