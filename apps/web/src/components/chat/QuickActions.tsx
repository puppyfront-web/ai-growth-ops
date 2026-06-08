'use client';

const ACTIONS = [
  { label: '📝 写一篇内容', prompt: '帮我写一篇关于' },
  { label: '🎨 内容+配图', prompt: '帮我生成一篇带AI配图的内容，主题是' },
  { label: '📤 发布内容', prompt: '帮我发布最新内容到' },
  { label: '🔍 研究热点', prompt: '帮我研究一下最近' },
  { label: '💬 查看互动', prompt: '查看今天有哪些新评论和私信' },
  { label: '💬 回复评论', prompt: '拉取最新评论帮我回复' },
  { label: '🔗 账号状态', prompt: '检查所有账号的连接状态' },
  { label: '🎯 查看线索', prompt: '显示最新的线索列表' },
  { label: '📊 数据概览', prompt: '显示本周数据分析' },
  { label: '🚀 创建运营活动', prompt: '帮我创建一个内容运营活动' },
  { label: '🔄 一键全流程', prompt: '执行完整的内容发布到互动管理流程' },
  { label: '⚙️ 自动回复配置', prompt: '查看自动回复设置' },
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
          内容创作、自动运营、互动管理、数据分析一站式 AI 闭环
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
