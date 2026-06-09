'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';

// ─── Tool Label Mapping (shared) ────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
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

// ─── Rich Tool Renderers ────────────────────────────────────────

const WriteContentTool = makeAssistantToolUI({
  toolName: 'write_content',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="创建内容" />;
    const r = result as Record<string, unknown>;
    const c = r.contentItem as Record<string, unknown> | undefined;
    if (!c) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 text-muted-foreground text-xs">
        <span className="font-medium text-foreground">{String(c.title || '无标题')}</span>
        <span className="ml-2">ID: {String(c.id)?.slice(0, 8)}…</span>
      </div>
    );
  },
});

const CheckComplianceTool = makeAssistantToolUI({
  toolName: 'check_compliance',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="合规检查" />;
    const r = result as Record<string, unknown>;
    const passed = r.passed;
    const issues = (r.issues || []) as Array<Record<string, unknown>>;
    return (
      <div className="mt-1 text-xs">
        <span className={passed ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {passed ? '✅ 合规通过' : `❌ ${issues.length} 个问题`}
        </span>
        {!passed && issues.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {issues.slice(0, 5).map((iss, i) => (
              <li key={i}>{String(iss.message || iss.type || JSON.stringify(iss))}</li>
            ))}
            {issues.length > 5 && <li>...还有 {issues.length - 5} 个问题</li>}
          </ul>
        )}
      </div>
    );
  },
});

const RewriteForPlatformTool = makeAssistantToolUI({
  toolName: 'rewrite_for_platform',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="平台改写" />;
    if (!Array.isArray(result)) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 flex flex-wrap gap-1 text-xs">
        {(result as Array<Record<string, unknown>>).map((v, i) => (
          <span key={i} className="rounded bg-accent px-1.5 py-0.5">{String(v.platform || `变体${i + 1}`)}</span>
        ))}
      </div>
    );
  },
});

const ListAccountsTool = makeAssistantToolUI({
  toolName: 'list_accounts',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="账号列表" />;
    const r = result as Record<string, unknown>;
    const accounts = (r.accounts || []) as Array<Record<string, unknown>>;
    if (!accounts.length) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 space-y-0.5 text-xs">
        {accounts.slice(0, 8).map((a) => (
          <div key={String(a.id)} className="flex items-center gap-2 text-muted-foreground">
            <span>{String(a.platform)}</span>
            <span className={a.hasCookie !== false ? 'text-green-600' : 'text-orange-500'}>
              {a.hasCookie !== false ? '✓' : '✗ 未登录'}
            </span>
          </div>
        ))}
        {accounts.length > 8 && <div>...还有 {accounts.length - 8} 个</div>}
      </div>
    );
  },
});

const CheckLoginStatusTool = makeAssistantToolUI({
  toolName: 'check_login_status',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="登录状态" />;
    const r = result as Record<string, unknown>;
    if (!r.status) return <ToolResultFallback result={result} />;
    const statusMap: Record<string, string> = {
      waiting_scan: '⏳ 等待扫码',
      logged_in: '✅ 已登录',
      expired: '❌ 已过期',
    };
    return <div className="mt-1 font-medium text-xs">{statusMap[String(r.status)] || String(r.status)}</div>;
  },
});

const CheckPublishStatusTool = makeAssistantToolUI({
  toolName: 'check_publish_status',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="发布状态" />;
    const r = result as Record<string, unknown>;
    if (!r.status) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 text-xs">
        <span className="font-medium">{String(r.status)}</span>
        {(r.platformAccount as Record<string, unknown>)?.platform ? (
          <span className="ml-2 text-muted-foreground">{String((r.platformAccount as Record<string, unknown>).platform)}</span>
        ) : null}
      </div>
    );
  },
});

const ListInteractionsTool = makeAssistantToolUI({
  toolName: 'list_interactions',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="互动列表" />;
    const r = result as Record<string, unknown>;
    const items = ((r.items || (Array.isArray(result) ? result : [])) as Array<Record<string, unknown>>);
    if (!items.length) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 text-muted-foreground text-xs">
        {items.slice(0, 5).map((item, i) => (
          <div key={i} className="truncate">{String(item.userNickname || '用户')}: {String(item.content)?.slice(0, 40)}</div>
        ))}
        {items.length > 5 && <div>...还有 {items.length - 5} 条</div>}
      </div>
    );
  },
});

const ClassifyInteractionTool = makeAssistantToolUI({
  toolName: 'classify_interaction',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="线索分类" />;
    const r = result as Record<string, unknown>;
    const c = r.classification as Record<string, unknown> | undefined;
    if (!c) return <ToolResultFallback result={result} />;
    const levelColors: Record<string, string> = { A: 'text-green-600', B: 'text-blue-600', C: 'text-yellow-600', D: 'text-gray-500' };
    return (
      <div className="mt-1 text-xs">
        <span className={levelColors[String(c.leadLevel)] || ''}>等级 {String(c.leadLevel)}</span>
        <span className="ml-2">{String(c.intent)}</span>
        <span className="ml-2 text-muted-foreground">置信度 {Math.round((Number(c.confidence) || 0) * 100)}%</span>
      </div>
    );
  },
});

const GetAnalyticsTool = makeAssistantToolUI({
  toolName: 'get_analytics',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="数据分析" />;
    const r = result as Record<string, unknown>;
    return (
      <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground text-xs">
        {r.totalInteractions != null && <div>互动: {String(r.totalInteractions)}</div>}
        {r.totalLeads != null && <div>线索: {String(r.totalLeads)}</div>}
        {r.totalContentItems != null && <div>内容: {String(r.totalContentItems)}</div>}
        {r.totalPublishJobs != null && <div>发布: {String(r.totalPublishJobs)}</div>}
      </div>
    );
  },
});

const GetEngagementMetricsTool = makeAssistantToolUI({
  toolName: 'get_engagement_metrics',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="互动分析" />;
    const r = result as Record<string, unknown>;
    return (
      <div className="mt-1 space-y-1 text-muted-foreground text-xs">
        <div>总互动: {String(r.totalInteractions)}</div>
        <div>回复率: {Math.round((Number(r.replyRate) || 0) * 100)}%</div>
        <div>自动回复率: {Math.round((Number(r.autoReplyRate) || 0) * 100)}%</div>
        <div>线索转化率: {Math.round((Number(r.leadConversionRate) || 0) * 100)}%</div>
        {r.leadsByLevel ? (
          <div>线索等级: {Object.entries(r.leadsByLevel as Record<string, unknown>).map(([k,v]) => `${k}: ${String(v)}`).join(', ')}</div>
        ) : null}
      </div>
    );
  },
});

const GetContentPerformanceTool = makeAssistantToolUI({
  toolName: 'get_content_performance',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="内容表现" />;
    const r = result as Record<string, unknown>;
    const items = (r.items || []) as Array<Record<string, unknown>>;
    if (!items.length) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 space-y-0.5 text-xs">
        {items.slice(0, 5).map((c, i) => (
          <div key={i} className="text-muted-foreground">
            <span className="text-foreground">{String(c.title)}</span>
            <span className="ml-2">互动:{String(c.interactionCount)} 线索:{String(c.leadCount)} 评分:{String(c.engagementScore)}</span>
          </div>
        ))}
        {items.length > 5 && <div>...还有 {items.length - 5} 个</div>}
      </div>
    );
  },
});

const CreateCampaignTool = makeAssistantToolUI({
  toolName: 'create_campaign',
  render: ({ result }) => <EntityCreated result={result} />,
});

const CreateWorkflowTool = makeAssistantToolUI({
  toolName: 'create_workflow',
  render: ({ result }) => <EntityCreated result={result} />,
});

const CreateWorkflowFromTemplateTool = makeAssistantToolUI({
  toolName: 'create_workflow_from_template',
  render: ({ result }) => <EntityCreated result={result} />,
});

const GetCampaignDetailTool = makeAssistantToolUI({
  toolName: 'get_campaign_detail',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="活动详情" />;
    const r = result as Record<string, unknown>;
    if (!r.id) return <ToolResultFallback result={result} />;
    return (
      <div className="mt-1 space-y-1 text-xs">
        <div><span className="font-medium text-foreground">{String(r.name)}</span> <span className="text-muted-foreground">{String(r.status)}</span></div>
        {r.platforms ? <div>平台: {(r.platforms as string[]).join(', ')}</div> : null}
        <div>已发布: {String(r.publishedCount)} {r.maxPostsTotal ? `/ ${String(r.maxPostsTotal)}` : ''}</div>
        {(r.runs as Array<Record<string, unknown>> | undefined)?.slice(0, 3).map((run, i) => (
          <div key={i} className="text-muted-foreground text-xs">
            {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⏳'} {String(run.status)} {String(run.createdAt)?.slice(0, 10)}
          </div>
        ))}
      </div>
    );
  },
});

const GetWorkflowStatusTool = makeAssistantToolUI({
  toolName: 'get_workflow_status',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="工作流状态" />;
    const r = result as Record<string, unknown>;
    if (!r.id) return <ToolResultFallback result={result} />;
    const steps = (r.steps as Array<Record<string, unknown>>) || [];
    const executions = (r.executions as Array<Record<string, unknown>>) || [];
    return (
      <div className="mt-1 space-y-1 text-xs">
        <div><span className="font-medium text-foreground">{String(r.name)}</span> <span className="text-muted-foreground">{String(r.status)}</span></div>
        {steps.length > 0 && <div className="text-muted-foreground">步骤: {steps.length} 个</div>}
        {executions.slice(0, 3).map((exec, i) => (
          <div key={i} className="text-muted-foreground text-xs">
            {exec.status === 'completed' ? '✅' : exec.status === 'failed' ? '❌' : '⏳'} {String(exec.status)} 步骤 {String(exec.currentStepIndex || 0)}
          </div>
        ))}
      </div>
    );
  },
});

const GetAutoReplyConfigTool = makeAssistantToolUI({
  toolName: 'get_auto_reply_config',
  render: ({ result }) => <AutoReplyConfig result={result} />,
});

const UpdateAutoReplyConfigTool = makeAssistantToolUI({
  toolName: 'update_auto_reply_config',
  render: ({ result }) => <AutoReplyConfig result={result} />,
});

const ExecuteWorkflowTool = makeAssistantToolUI({
  toolName: 'execute_workflow',
  render: ({ result }) => <ExecutionTriggered result={result} />,
});

const TriggerCampaignRunTool = makeAssistantToolUI({
  toolName: 'trigger_campaign_run',
  render: ({ result }) => <ExecutionTriggered result={result} />,
});

const GetProactiveSuggestionsTool = makeAssistantToolUI({
  toolName: 'get_proactive_suggestions',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="运营建议" />;
    const r = result as Record<string, unknown>;
    const suggestions = (r.suggestions || []) as Array<{ priority: string; title: string; description: string }>;
    return (
      <div className="mt-1 space-y-1 text-xs">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-muted-foreground">
            <span>{s.priority === 'high' ? '⚠️' : s.priority === 'medium' ? '📋' : '💡'}</span>
            <div>
              <span className="text-foreground font-medium">{s.title}</span>
              <span className="ml-1 opacity-60">{s.description}</span>
            </div>
          </div>
        ))}
        {suggestions.length === 0 && <div className="text-green-600">✅ 一切正常，暂无待办事项</div>}
      </div>
    );
  },
});

const GetMyPreferencesTool = makeAssistantToolUI({
  toolName: 'get_my_preferences',
  render: ({ result }) => <PreferencesDisplay result={result} />,
});

const RememberPreferenceTool = makeAssistantToolUI({
  toolName: 'remember_preference',
  render: ({ result }) => <PreferencesDisplay result={result} />,
});

const ListPlanTemplatesTool = makeAssistantToolUI({
  toolName: 'list_plan_templates',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="计划模板" />;
    const r = result as Record<string, unknown>;
    const templates = (r.templates || []) as Array<Record<string, unknown>>;
    return (
      <div className="mt-1 space-y-1 text-xs">
        {templates.map((t, i) => (
          <div key={i} className="text-muted-foreground">
            <span className="text-foreground font-medium">{String(t.name)}</span>
            <span className="ml-2 opacity-60">({String(t.stepCount)}步) {String(t.description)}</span>
          </div>
        ))}
      </div>
    );
  },
});

const ExecutePlanTool = makeAssistantToolUI({
  toolName: 'execute_plan',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="执行计划" />;
    const r = result as Record<string, unknown>;
    if (!r.planStarted) return <ToolResultFallback result={result} />;
    const steps = (r.steps || []) as Array<Record<string, unknown>>;
    return (
      <div className="mt-1 text-xs">
        <div className="font-medium text-foreground">📋 {String(r.planName)}</div>
        <div className="text-muted-foreground">共 {String(r.totalSteps)} 步</div>
        <div className="mt-1 space-y-0.5">
          {steps.map((s, i) => (
            <div key={i} className="text-muted-foreground">
              {i + 1}. {String(s.description)} <span className="opacity-60">({String(s.toolName)})</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});

const SearchVideoCommentsTool = makeAssistantToolUI({
  toolName: 'search_video_comments',
  render: ({ result }) => {
    if (!result) return <ToolLoading label="视频评论挖掘" />;
    const r = result as Record<string, unknown>;
    const prospects = (r.prospects || []) as Array<{ userName?: string; content?: string; leadLevel?: string; intent?: string; videoTitle?: unknown }>;
    const levelCounts = r.levelCounts as Record<string, number> | undefined;
    const totalVideos = Number(r.totalVideos) || 0;
    const totalComments = Number(r.totalComments) || 0;
    return (
      <div className="mt-1 space-y-2 text-xs">
        <div className="font-medium text-foreground">🔍 挖掘报告：{String(r.keyword || '')}</div>
        <div className="flex gap-3 text-muted-foreground">
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
            <div className="font-medium text-foreground">🎯 意向客户 ({prospects.length}):</div>
            {prospects.slice(0, 10).map((p, i) => (
              <div key={i} className="bg-accent/50 rounded px-2 py-1">
                <span className={p.leadLevel === 'A' ? 'text-green-600 font-medium' : 'text-blue-600 font-medium'}>
                  {p.leadLevel}级
                </span>
                <span className="ml-1 font-medium">{p.userName || '用户'}</span>
                <span className="ml-1 text-muted-foreground">({p.intent})</span>
                <div className="text-muted-foreground mt-0.5 truncate">{p.content}</div>
                {p.videoTitle ? <div className="text-muted-foreground opacity-60 truncate">来自: {String(p.videoTitle)}</div> : null}
              </div>
            ))}
            {prospects.length > 10 && <div className="text-muted-foreground">...还有 {prospects.length - 10} 个意向客户</div>}
          </div>
        ) : (
          <div className="text-muted-foreground">本次搜索未发现A/B级意向客户</div>
        )}
      </div>
    );
  },
});

// ─── Shared Sub-Components ───────────────────────────────────────

function ToolLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="animate-spin">⏳</span>
      <span>{label}...</span>
    </div>
  );
}

function ToolResultFallback({ result }: { result: unknown }) {
  return (
    <pre className="mt-1 max-h-32 overflow-auto text-muted-foreground text-xs">
      {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
    </pre>
  );
}

function EntityCreated({ result }: { result: unknown }) {
  if (!result) return <ToolLoading label="创建中" />;
  const r = result as Record<string, unknown>;
  if (!r.id) return <ToolResultFallback result={result} />;
  return (
    <div className="mt-1 text-xs">
      <span className="font-medium text-foreground">{String(r.name)}</span>
      <span className="ml-2 text-muted-foreground">ID: {String(r.id)?.slice(0, 8)}…</span>
      <span className="ml-2">状态: {String(r.status)}</span>
    </div>
  );
}

function AutoReplyConfig({ result }: { result: unknown }) {
  if (!result) return <ToolLoading label="自动回复配置" />;
  const r = result as Record<string, unknown>;
  return (
    <div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
      <div>启用: {r.enabled ? '✅ 是' : '❌ 否'}</div>
      <div>每日上限: {String(r.maxDailyAutoReplies)}</div>
      <div>置信度阈值: {String(r.confidenceThreshold)}</div>
      <div>允许类型: {(r.allowedReplyTypes as string[])?.join(', ')}</div>
      <div>静默期: {String(r.quietHoursStart)} - {String(r.quietHoursEnd)}</div>
    </div>
  );
}

function ExecutionTriggered({ result }: { result: unknown }) {
  if (!result) return <ToolLoading label="执行中" />;
  const r = result as Record<string, unknown>;
  if (!r.ok) return <ToolResultFallback result={result} />;
  return (
    <div className="mt-1 text-green-600 font-medium text-xs">
      ✅ 已触发执行 {r.executionId ? `(ID: ${String(r.executionId)?.slice(0, 8)}…)` : r.runId ? `(Run: ${String(r.runId)?.slice(0, 8)}…)` : ''}
    </div>
  );
}

function PreferencesDisplay({ result }: { result: unknown }) {
  if (!result) return <ToolLoading label="偏好设置" />;
  const r = result as Record<string, unknown>;
  if (r.message) {
    return <div className="mt-1 text-green-600 font-medium text-xs">✅ {String(r.message)}</div>;
  }
  const prefLines: string[] = [];
  if ((r.preferredPlatforms as string[])?.length) prefLines.push(`平台: ${(r.preferredPlatforms as string[]).join(', ')}`);
  if (r.contentStylePreferences) prefLines.push(`内容风格: ${String(r.contentStylePreferences)}`);
  if (r.replyStylePreferences) prefLines.push(`回复风格: ${String(r.replyStylePreferences)}`);
  if (r.brandVoice) prefLines.push(`品牌调性: ${String(r.brandVoice)}`);
  if ((r.preferredPublishTimes as string[])?.length) prefLines.push(`发布时间: ${(r.preferredPublishTimes as string[]).join(', ')}`);
  return (
    <div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
      {prefLines.length > 0 ? prefLines.map((l, i) => <div key={i}>{l}</div>) : <div>暂无偏好设置</div>}
    </div>
  );
}

// ─── Registry: renders all custom tool UIs ───────────────────────
// makeAssistantToolUI registers globally, so we just need to render
// all components once inside the provider tree.

export function ToolUIRegistry() {
  return (
    <>
      <WriteContentTool />
      <CheckComplianceTool />
      <RewriteForPlatformTool />
      <ListAccountsTool />
      <CheckLoginStatusTool />
      <CheckPublishStatusTool />
      <ListInteractionsTool />
      <ClassifyInteractionTool />
      <GetAnalyticsTool />
      <GetEngagementMetricsTool />
      <GetContentPerformanceTool />
      <CreateCampaignTool />
      <CreateWorkflowTool />
      <CreateWorkflowFromTemplateTool />
      <GetCampaignDetailTool />
      <GetWorkflowStatusTool />
      <GetAutoReplyConfigTool />
      <UpdateAutoReplyConfigTool />
      <ExecuteWorkflowTool />
      <TriggerCampaignRunTool />
      <GetProactiveSuggestionsTool />
      <GetMyPreferencesTool />
      <RememberPreferenceTool />
      <ListPlanTemplatesTool />
      <ExecutePlanTool />
      <SearchVideoCommentsTool />
    </>
  );
}
