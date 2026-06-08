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
        <span>{TOOL_LABELS[name] || name}</span>
      </div>
      {state === 'result' && result && (
        <ToolResult name={name} result={result} />
      )}
    </div>
  );
}

/** Human-readable tool name mapping */
const TOOL_LABELS: Record<string, string> = {
  write_content: '创建内容',
  list_content: '内容列表',
  get_content_detail: '内容详情',
  check_compliance: '合规检查',
  rewrite_for_platform: '平台改写',
  approve_variant: '批准变体',
  list_accounts: '账号列表',
  check_cookie_status: 'Cookie 检查',
  login_account: '扫码登录',
  check_login_status: '登录状态',
  create_publish_job: '创建发布任务',
  execute_publish: '执行发布',
  check_publish_status: '发布状态',
  retry_publish: '重试发布',
  publish_content: '批量发布',
  sync_comments: '同步评论',
  sync_messages: '同步私信',
  list_interactions: '互动列表',
  classify_interaction: '线索分类',
  suggest_reply: '回复建议',
  reply_to_interaction: '回复互动',
  convert_to_lead: '转化为线索',
  run_research: '执行调研',
  get_research_insights: '调研洞察',
  list_leads: '线索列表',
  sync_lead_to_feishu: '同步飞书',
  sync_lead_to_wecom: '同步企微',
  get_analytics: '数据分析',
};

/** Structured tool result renderer */
function ToolResult({ name, result }: { name: string; result: any }) {
  const r = typeof result === 'string' ? null : result;

  // Content item created
  if (name === 'write_content' && r?.contentItem) {
    const c = r.contentItem;
    return (
      <div className="mt-1 text-muted-foreground">
        <span className="font-medium text-foreground">{c.title || '无标题'}</span>
        <span className="ml-2">ID: {c.id?.slice(0, 8)}…</span>
      </div>
    );
  }

  // Compliance check
  if (name === 'check_compliance' && r) {
    const passed = r.passed;
    const issues = r.issues || [];
    return (
      <div className="mt-1">
        <span className={passed ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {passed ? '✅ 合规通过' : `❌ ${issues.length} 个问题`}
        </span>
        {!passed && issues.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {issues.slice(0, 5).map((iss: any, i: number) => (
              <li key={i}>{iss.message || iss.type || JSON.stringify(iss)}</li>
            ))}
            {issues.length > 5 && <li>...还有 {issues.length - 5} 个问题</li>}
          </ul>
        )}
      </div>
    );
  }

  // Platform variants generated
  if (name === 'rewrite_for_platform' && Array.isArray(r)) {
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {r.map((v: any, i: number) => (
          <span key={i} className="rounded bg-accent px-1.5 py-0.5">{v.platform || `变体${i + 1}`}</span>
        ))}
      </div>
    );
  }

  // Account list / cookie status
  if ((name === 'list_accounts' || name === 'check_cookie_status') && r?.accounts) {
    return (
      <div className="mt-1 space-y-0.5">
        {r.accounts.slice(0, 8).map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 text-muted-foreground">
            <span>{a.platform}</span>
            <span className={a.hasCookie !== false ? 'text-green-600' : 'text-orange-500'}>
              {a.hasCookie !== false ? '✓' : '✗ 未登录'}
            </span>
          </div>
        ))}
        {r.accounts.length > 8 && <div>...还有 {r.accounts.length - 8} 个</div>}
      </div>
    );
  }

  // Login status
  if (name === 'check_login_status' && r?.status) {
    const statusMap: Record<string, string> = {
      waiting_scan: '⏳ 等待扫码',
      logged_in: '✅ 已登录',
      expired: '❌ 已过期',
      error: `❌ ${r.error || '错误'}`,
    };
    return <div className="mt-1 font-medium">{statusMap[r.status] || r.status}</div>;
  }

  // Publish status
  if (name === 'check_publish_status' && r?.status) {
    return (
      <div className="mt-1">
        <span className="font-medium">{r.status}</span>
        {r.platformAccount?.platform && <span className="ml-2 text-muted-foreground">{r.platformAccount.platform}</span>}
      </div>
    );
  }

  // Interaction list
  if (name === 'list_interactions' && (r?.items || Array.isArray(r))) {
    const items = r?.items || (Array.isArray(r) ? r : []);
    return (
      <div className="mt-1 text-muted-foreground">
        {items.slice(0, 5).map((item: any, i: number) => (
          <div key={i} className="truncate">{item.userNickname || '用户'}: {item.content?.slice(0, 40)}</div>
        ))}
        {items.length > 5 && <div>...还有 {items.length - 5} 条</div>}
      </div>
    );
  }

  // Lead classification
  if (name === 'classify_interaction' && r?.classification) {
    const c = r.classification;
    const levelColors: Record<string, string> = { A: 'text-green-600', B: 'text-blue-600', C: 'text-yellow-600', D: 'text-gray-500' };
    return (
      <div className="mt-1">
        <span className={levelColors[c.leadLevel] || ''}>等级 {c.leadLevel}</span>
        <span className="ml-2">{c.intent}</span>
        <span className="ml-2 text-muted-foreground">置信度 {Math.round((c.confidence || 0) * 100)}%</span>
      </div>
    );
  }

  // Analytics overview
  if (name === 'get_analytics' && r) {
    return (
      <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground">
        {r.totalInteractions != null && <div>互动: {r.totalInteractions}</div>}
        {r.totalLeads != null && <div>线索: {r.totalLeads}</div>}
        {r.totalContentItems != null && <div>内容: {r.totalContentItems}</div>}
        {r.totalPublishJobs != null && <div>发布: {r.totalPublishJobs}</div>}
      </div>
    );
  }

  // Default: JSON fallback (compact)
  return (
    <pre className="mt-1 max-h-32 overflow-auto text-muted-foreground">
      {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
    </pre>
  );
}
