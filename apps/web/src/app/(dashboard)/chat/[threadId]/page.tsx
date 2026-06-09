'use client';

import { use } from 'react';
import { AssistantProvider } from '@/components/chat/AssistantProvider';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { useRouter } from 'next/navigation';

export default function ThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const router = useRouter();

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      <ChatSidebar
        activeThreadId={threadId}
        onSelectThread={(id) => router.push(`/chat/${id}`)}
        onNewThread={() => router.push('/chat')}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AssistantProvider threadId={threadId} />
      </div>
    </div>
  );
}
