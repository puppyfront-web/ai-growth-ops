'use client';

import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider, useThreadListItem } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { ToolUIRegistry } from '@/components/chat/tool-renderers';
import { authToken, currentOrg } from '@/lib/api/client';
import { Component, type ReactNode, useEffect, useRef, useState } from 'react';

// ─── Error Boundary ──────────────────────────────────────────────

class ChatErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
          <p className="text-lg font-medium">聊天组件加载出错</p>
          <p className="text-sm">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Public Component ────────────────────────────────────────────

interface AssistantProviderProps {
  threadId?: string;
  onThreadIdChange?: (threadId: string | undefined) => void;
}

/**
 * Provider that bridges assistant-ui with our /api/chat route.
 *
 * Auth (token + orgId) is read from localStorage on each request via
 * a function body, so it stays fresh across login/org switches.
 */
export function AssistantProvider({ threadId, onThreadIdChange }: AssistantProviderProps) {
  const [mounted, setMounted] = useState(false);

  // Wait for client-side mount to access localStorage
  useEffect(() => {
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
    <ChatErrorBoundary>
      <AssistantProviderInner threadId={threadId} onThreadIdChange={onThreadIdChange} />
    </ChatErrorBoundary>
  );
}

// ─── Inner Provider ──────────────────────────────────────────────

function AssistantProviderInner({
  threadId,
  onThreadIdChange,
}: {
  threadId?: string;
  onThreadIdChange?: (threadId: string | undefined) => void;
}) {
  // Use a function for `body` so token/orgId are re-read from localStorage
  // on every request — stays fresh across login/logout/org switches.
  // threadId is captured via ref so the function always sees the latest value.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: '/api/chat',
      body: () => ({
        threadId: threadIdRef.current || undefined,
        token: authToken.get() || '',
        organizationId: currentOrg.get() || '',
      }),
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

// ─── ThreadId Sync ────────────────────────────────────────────────

/**
 * Watches the runtime's thread list item for a remoteId (assigned by
 * the server via X-Thread-Id header) and calls onThreadIdChange so
 * the parent page can update the URL to /chat/[threadId].
 */
function ThreadIdSync({
  onThreadIdChange,
}: {
  onThreadIdChange?: (threadId: string | undefined) => void;
}) {
  const { remoteId } = useThreadListItem();

  const prevRemoteIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (remoteId && remoteId !== prevRemoteIdRef.current) {
      prevRemoteIdRef.current = remoteId;
      onThreadIdChange?.(remoteId);
    }
  }, [remoteId, onThreadIdChange]);

  return null;
}
