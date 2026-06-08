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
  generate_content_with_media: '内容+配图',
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
  get_auto_reply_config: '自动回复配置',
  update_auto_reply_config: '修改自动回复',
  review_pending_replies: '待审核回复',
  approve_reply: '审核回复',
  run_research: '执行调研',
  get_research_insights: '调研洞察',
  list_leads: '线索列表',
  sync_lead_to_feishu: '同步飞书',
  sync_lead_to_wecom: '同步企微',
  get_analytics: '数据分析',
  get_engagement_metrics: '互动分析',
  get_content_performance: '内容表现',
  create_campaign: '创建活动',
  list_campaigns: '活动列表',
  get_campaign_detail: '活动详情',
  start_campaign: '启动活动',
  pause_campaign: '暂停活动',
  trigger_campaign_run: '立即执行',
  create_workflow: '创建工作流',
  create_workflow_from_template: '模板创建工作流',
  list_workflows: '工作流列表',
  execute_workflow: '执行工作流',
  get_workflow_status: '工作流状态',
  pause_workflow: '暂停工作流',
  get_proactive_suggestions: '运营建议',
  get_my_preferences: '我的偏好',
  remember_preference: '记住偏好',
  list_plan_templates: '计划模板',
  execute_plan: '执行计划',
  search_video_comments: '视频评论挖掘',
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

  // Engagement metrics
  if (name === 'get_engagement_metrics' && r) {
    return (
      <div className="mt-1 space-y-1 text-muted-foreground">
        <div>总互动: {r.totalInteractions}</div>
        <div>回复率: {Math.round((r.replyRate || 0) * 100)}%</div>
        <div>自动回复率: {Math.round((r.autoReplyRate || 0) * 100)}%</div>
        <div>线索转化率: {Math.round((r.leadConversionRate || 0) * 100)}%</div>
        {r.leadsByLevel && (
          <div>线索等级: {Object.entries(r.leadsByLevel).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
        )}
      </div>
    );
  }

  // Content performance
  if (name === 'get_content_performance' && r?.items) {
    return (
      <div className="mt-1 space-y-0.5">
        {(r.items as any[]).slice(0, 5).map((c: any, i: number) => (
          <div key={i} className="text-muted-foreground">
            <span className="text-foreground">{c.title}</span>
            <span className="ml-2">互动:{c.interactionCount} 线索:{c.leadCount} 评分:{c.engagementScore}</span>
          </div>
        ))}
        {r.items.length > 5 && <div>...还有 {r.items.length - 5} 个</div>}
      </div>
    );
  }

  // Campaign / workflow created
  if ((name === 'create_campaign' || name === 'create_workflow' || name === 'create_workflow_from_template') && r?.id) {
    return (
      <div className="mt-1">
        <span className="font-medium text-foreground">{r.name}</span>
        <span className="ml-2 text-muted-foreground">ID: {r.id?.slice(0, 8)}…</span>
        <span className="ml-2">状态: {r.status}</span>
      </div>
    );
  }

  // Campaign detail
  if (name === 'get_campaign_detail' && r?.id) {
    return (
      <div className="mt-1 space-y-1">
        <div><span className="font-medium text-foreground">{r.name}</span> <span className="text-muted-foreground">{r.status}</span></div>
        {r.platforms && <div>平台: {(r.platforms as string[]).join(', ')}</div>}
        <div>已发布: {r.publishedCount} {r.maxPostsTotal ? `/ ${r.maxPostsTotal}` : ''}</div>
        {r.runs && (r.runs as any[]).slice(0, 3).map((run: any, i: number) => (
          <div key={i} className="text-muted-foreground text-xs">
            {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⏳'} {run.status} {run.createdAt?.slice(0, 10)}
          </div>
        ))}
      </div>
    );
  }

  // Workflow status
  if (name === 'get_workflow_status' && r?.id) {
    return (
      <div className="mt-1 space-y-1">
        <div><span className="font-medium text-foreground">{r.name}</span> <span className="text-muted-foreground">{r.status}</span></div>
        {(r.steps as any[])?.length && <div className="text-muted-foreground">步骤: {(r.steps as any[]).length} 个</div>}
        {r.executions && (r.executions as any[]).slice(0, 3).map((exec: any, i: number) => (
          <div key={i} className="text-muted-foreground text-xs">
            {exec.status === 'completed' ? '✅' : exec.status === 'failed' ? '❌' : '⏳'} {exec.status} 步骤 {exec.currentStepIndex || 0}
          </div>
        ))}
      </div>
    );
  }

  // Auto-reply config
  if ((name === 'get_auto_reply_config' || name === 'update_auto_reply_config') && r) {
    return (
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        <div>启用: {r.enabled ? '✅ 是' : '❌ 否'}</div>
        <div>每日上限: {r.maxDailyAutoReplies}</div>
        <div>置信度阈值: {r.confidenceThreshold}</div>
        <div>允许类型: {(r.allowedReplyTypes as string[])?.join(', ')}</div>
        <div>静默期: {r.quietHoursStart} - {r.quietHoursEnd}</div>
      </div>
    );
  }

  // Execute workflow / campaign run
  if ((name === 'execute_workflow' || name === 'trigger_campaign_run') && r?.ok) {
    return (
      <div className="mt-1 text-green-600 font-medium">
        ✅ 已触发执行 {r.executionId ? `(ID: ${r.executionId?.slice(0, 8)}…)` : r.runId ? `(Run: ${r.runId?.slice(0, 8)}…)` : ''}
      </div>
    );
  }

  // Proactive suggestions
  if (name === 'get_proactive_suggestions' && r?.suggestions) {
    const suggestions = r.suggestions as Array<{ priority: string; title: string; description: string }>;
    return (
      <div className="mt-1 space-y-1">
        {(suggestions as any[]).map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-muted-foreground">
            <span>{s.priority === 'high' ? '⚠️' : s.priority === 'medium' ? '📋' : '💡'}</span>
            <div>
              <span className="text-foreground font-medium">{s.title}</span>
              <span className="ml-1 text-xs">{s.description}</span>
            </div>
          </div>
        ))}
        {(suggestions as any[]).length === 0 && <div className="text-green-600">✅ 一切正常，暂无待办事项</div>}
      </div>
    );
  }

  // User preferences
  if ((name === 'get_my_preferences' || name === 'remember_preference') && r) {
    if (r.message) {
      return <div className="mt-1 text-green-600 font-medium">✅ {r.message}</div>;
    }
    const prefs = r;
    const prefLines = [];
    if (prefs.preferredPlatforms?.length) prefLines.push(`平台: ${(prefs.preferredPlatforms as string[]).join(', ')}`);
    if (prefs.contentStylePreferences) prefLines.push(`内容风格: ${prefs.contentStylePreferences}`);
    if (prefs.replyStylePreferences) prefLines.push(`回复风格: ${prefs.replyStylePreferences}`);
    if (prefs.brandVoice) prefLines.push(`品牌调性: ${prefs.brandVoice}`);
    if (prefs.preferredPublishTimes?.length) prefLines.push(`发布时间: ${(prefs.preferredPublishTimes as string[]).join(', ')}`);
    return (
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {prefLines.length > 0 ? prefLines.map((l, i) => <div key={i}>{l}</div>) : <div>暂无偏好设置</div>}
      </div>
    );
  }

  // Plan templates list
  if (name === 'list_plan_templates' && r?.templates) {
    return (
      <div className="mt-1 space-y-1">
        {(r.templates as any[]).map((t, i) => (
          <div key={i} className="text-muted-foreground">
            <span className="text-foreground font-medium">{t.name}</span>
            <span className="ml-2 text-xs">({t.stepCount}步) {t.description}</span>
          </div>
        ))}
      </div>
    );
  }

  // Execute plan
  if (name === 'execute_plan' && r?.planStarted) {
    return (
      <div className="mt-1">
        <div className="font-medium text-foreground">📋 {r.planName}</div>
        <div className="text-muted-foreground text-xs">共 {r.totalSteps} 步</div>
        <div className="mt-1 space-y-0.5">
          {(r.steps as any[]).map((s, i) => (
            <div key={i} className="text-muted-foreground text-xs">
              {i + 1}. {s.description} <span className="text-xs opacity-60">({s.toolName})</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Prospecting search result
  if (name === 'search_video_comments' && r) {
    const prospects = (r.prospects || []) as Array<{ userName?: string; content?: string; leadLevel?: string; intent?: string; videoTitle?: unknown; videoAuthor?: unknown }>;
    const levelCounts = r.levelCounts as Record<string, number> | undefined;
    const totalVideos = r.totalVideos as number || 0;
    const totalComments = r.totalComments as number || 0;
    return (
      <div className="mt-1 space-y-2">
        <div className="font-medium text-foreground">🔍 挖掘报告：{String(r.keyword || '')}</div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>📹 {totalVideos} 个视频</span>
          <span>💬 {totalComments} 条评论</span>
          {levelCounts && <>
            <span className="text-green-600">A级 {levelCounts.A || 0}</span>
            <span className="text-blue-600">B级 {levelCounts.B || 0}</span>
            <span>C级 {levelCounts.C || 0}</span>
            <span className="text-gray-400">D级 {levelCounts.D || 0}</span>
          </>}
        </div>
        {prospects.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">🎯 意向客户 ({prospects.length}):</div>
            {prospects.slice(0, 10).map((p, i) => (
              <div key={i} className="text-xs bg-accent/50 rounded px-2 py-1">
                <span className={p.leadLevel === 'A' ? 'text-green-600 font-medium' : 'text-blue-600 font-medium'}>
                  {p.leadLevel}级
                </span>
                <span className="ml-1 font-medium">{p.userName || '用户'}</span>
                <span className="ml-1 text-muted-foreground">({p.intent})</span>
                <div className="text-muted-foreground mt-0.5 truncate">{p.content}</div>
                {p.videoTitle ? <div className="text-muted-foreground opacity-60 truncate">来自: {String(p.videoTitle)}</div> : null}
              </div>
            ))}
            {prospects.length > 10 && <div className="text-xs text-muted-foreground">...还有 {prospects.length - 10} 个意向客户</div>}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">本次搜索未发现A/B级意向客户</div>
        )}
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
