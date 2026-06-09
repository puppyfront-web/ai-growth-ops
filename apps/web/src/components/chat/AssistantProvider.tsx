'use client';

import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { ToolUIRegistry } from '@/components/chat/tool-renderers';
import { authToken, currentOrg } from '@/lib/api/client';
import { type ReactNode, useEffect, useState } from 'react';

interface AssistantProviderProps {
  threadId?: string;
  onThreadIdChange?: (threadId: string | undefined) => void;
}

/**
 * Provider that bridges assistant-ui with our /api/chat route.
 *
 * Auth (token + orgId) is injected into each request body so the server
 * can authenticate the user and persist messages to the backend.
 */
export function AssistantProvider({ threadId, onThreadIdChange }: AssistantProviderProps) {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState('');
  const [orgId, setOrgId] = useState('');

  // Wait for client-side mount to access localStorage
  useEffect(() => {
    setToken(authToken.get() || '');
    setOrgId(currentOrg.get() || '');
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <AssistantProviderInner
      threadId={threadId}
      token={token}
      orgId={orgId}
      onThreadIdChange={onThreadIdChange}
    />
  );
}

function AssistantProviderInner({
  threadId,
  token,
  orgId,
  onThreadIdChange,
}: {
  threadId?: string;
  token: string;
  orgId: string;
  onThreadIdChange?: (threadId: string | undefined) => void;
}) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/chat',
      body: {
        threadId: threadId || undefined,
        token,
        organizationId: orgId,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ToolUIRegistry />
      <ThreadIdSync onThreadIdChange={onThreadIdChange} />
      <Thread />
    </AssistantRuntimeProvider>
  );
}

/**
 * Syncs the threadId from the chat runtime back to the parent.
 * This allows the URL to update to /chat/[threadId] after the first message.
 */
function ThreadIdSync({ onThreadIdChange }: { onThreadIdChange?: (threadId: string | undefined) => void }) {
  // The runtime creates the thread on first message, but the threadId
  // comes back in the X-Thread-Id response header which useChat handles.
  // We could use runtime thread switching here if needed, but for now
  // the ThreadWelcome/Composer flow doesn't need URL sync.
  return null;
}
