'use client';

const ACTIONS = [
  { label: '📝 写一篇内容', prompt: '帮我写一篇关于' },
  { label: '📤 发布最新内容', prompt: '帮我发布最新内容到' },
  { label: '💬 查看今日互动', prompt: '查看今天有哪些新评论和私信' },
  { label: '🔍 研究热门话题', prompt: '帮我研究一下最近' },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">AI 运营助手</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          通过自然语言执行内容发布、互动管理、话题研究等任务
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => onSelect(action.prompt)}
            className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
