'use client';

import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolInvocations?: any[];
}

export function MessageBubble({ role, content, toolInvocations }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          AI
        </div>
      )}
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground',
      )}>
        <div className="whitespace-pre-wrap">{content}</div>
        {toolInvocations && toolInvocations.map((inv: any, i: number) => (
          <ToolCallCard key={i} invocation={inv} />
        ))}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
          你
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ invocation }: { invocation: any }) {
  const state = invocation.state;
  const name = invocation.toolName;
  const result = invocation.result;

  return (
    <div className="mt-2 rounded-lg border bg-background/50 p-2.5 text-xs">
      <div className="flex items-center gap-2 font-medium">
        {state === 'result' ? '✅' : state === 'call' ? '⏳' : '❌'}
        <span>{name}</span>
      </div>
      {state === 'result' && result && (
        <pre className="mt-1 max-h-32 overflow-auto text-muted-foreground">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
