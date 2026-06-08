/**
 * Pre-built Plan Templates for Multi-Step Orchestration
 *
 * Each template defines a sequence of tool calls with descriptions.
 * The AI can use these as starting points or create custom plans.
 */

export interface PlanStep {
  toolName: string;
  description: string;
  params?: Record<string, unknown>;
}

export interface PlanTemplate {
  name: string;
  description: string;
  steps: PlanStep[];
}

export const PLAN_TEMPLATES: Record<string, PlanTemplate> = {
  'content-to-publish': {
    name: '内容创作到发布',
    description: '从内容创作到平台发布的完整流程',
    steps: [
      { toolName: 'write_content', description: '创作内容' },
      { toolName: 'check_compliance', description: '合规检查' },
      { toolName: 'rewrite_for_platform', description: '平台改写' },
      { toolName: 'approve_variant', description: '批准变体' },
      { toolName: 'create_publish_job', description: '创建发布任务' },
    ],
  },
  'content-with-media': {
    name: '内容+配图到发布',
    description: '生成带AI配图的内容并发布',
    steps: [
      { toolName: 'generate_content_with_media', description: '生成内容+配图' },
      { toolName: 'check_compliance', description: '合规检查' },
      { toolName: 'rewrite_for_platform', description: '平台改写' },
      { toolName: 'approve_variant', description: '批准变体' },
      { toolName: 'create_publish_job', description: '创建发布任务' },
    ],
  },
  'engagement-sprint': {
    name: '互动管理全流程',
    description: '同步互动、分类、生成回复建议',
    steps: [
      { toolName: 'sync_comments', description: '同步评论' },
      { toolName: 'sync_messages', description: '同步私信' },
      { toolName: 'list_interactions', description: '查看互动' },
      { toolName: 'classify_interaction', description: '分类线索' },
      { toolName: 'suggest_reply', description: '生成回复建议' },
    ],
  },
  'research-to-content': {
    name: '调研到创作',
    description: '从调研热点到生成内容',
    steps: [
      { toolName: 'run_research', description: '执行调研' },
      { toolName: 'get_research_insights', description: '获取调研洞察' },
      { toolName: 'generate_content_with_media', description: '基于洞察生成内容+配图' },
    ],
  },
  'full-loop': {
    name: '完整运营闭环',
    description: '从调研到发布到互动管理的完整闭环',
    steps: [
      { toolName: 'run_research', description: '调研热点' },
      { toolName: 'get_research_insights', description: '获取洞察' },
      { toolName: 'generate_content_with_media', description: '生成内容+配图' },
      { toolName: 'check_compliance', description: '合规检查' },
      { toolName: 'rewrite_for_platform', description: '平台改写' },
      { toolName: 'approve_variant', description: '批准变体' },
      { toolName: 'create_publish_job', description: '创建发布任务' },
      { toolName: 'sync_comments', description: '同步评论' },
      { toolName: 'sync_messages', description: '同步私信' },
    ],
  },
};

export function getPlanTemplate(name: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES[name];
}

export function listPlanTemplates(): Array<{ key: string; name: string; description: string; stepCount: number }> {
  return Object.entries(PLAN_TEMPLATES).map(([key, tpl]) => ({
    key,
    name: tpl.name,
    description: tpl.description,
    stepCount: tpl.steps.length,
  }));
}
