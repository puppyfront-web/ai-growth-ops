'use client';

import { use } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';

export default function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  return <ChatPanel threadId={threadId} />;
}
