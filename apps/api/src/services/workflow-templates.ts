/**
 * Pre-built Workflow Templates
 *
 * Common workflow step definitions that can be instantiated
 * via POST /api/workflows/from-template.
 */

export interface StepDefinition {
  id: string;
  type: string;
  skillName?: string;
  input: Record<string, unknown>;
}

export type WorkflowTemplate = {
  name: string;
  description: string;
  steps: StepDefinition[];
};

const templates: Record<string, WorkflowTemplate> = {
  'full-loop': {
    name: '完整闭环',
    description:
      '调研 → 内容+配图 → 合规 → 发布 → 等待24h → 同步互动 → 自动回复 → 增长复盘',
    steps: [
      {
        id: 'research',
        type: 'skill',
        skillName: 'research-insight',
        input: { keywords: '${topic}' }
      },
      {
        id: 'write',
        type: 'skill',
        skillName: 'content-writing',
        input: { topic: '${research.title}', contentType: 'text_image' }
      },
      {
        id: 'media',
        type: 'generate-media',
        input: { prompt: '${write.imagePrompts[0].prompt}' }
      },
      {
        id: 'compliance',
        type: 'skill',
        skillName: 'compliance-check',
        input: { title: '${write.title}', body: '${write.body}' }
      },
      {
        id: 'rewrite',
        type: 'platform-rewrite',
        input: {
          sourceTitle: '${write.title}',
          sourceBody: '${write.body}',
          platforms: '${platforms}'
        }
      },
      {
        id: 'publish',
        type: 'publish',
        input: { contentItemId: '${write.id}', platforms: '${platforms}' }
      },
      { id: 'wait', type: 'delay', input: { duration: '24h' } },
      {
        id: 'sync',
        type: 'sync-interactions',
        input: { platforms: '${platforms}' }
      },
      { id: 'autoreply', type: 'auto-reply', input: {} },
      { id: 'review', type: 'growth-review', input: { period: 'last_run' } }
    ]
  },

  'content-sprint': {
    name: '内容冲刺',
    description: '内容+配图 → 合规 → 多平台发布',
    steps: [
      {
        id: 'write',
        type: 'skill',
        skillName: 'content-writing',
        input: { topic: '${topic}', contentType: '${contentType}' }
      },
      {
        id: 'media',
        type: 'generate-media',
        input: { prompt: '${write.imagePrompts[0].prompt}' }
      },
      {
        id: 'compliance',
        type: 'skill',
        skillName: 'compliance-check',
        input: { title: '${write.title}', body: '${write.body}' }
      },
      {
        id: 'rewrite',
        type: 'platform-rewrite',
        input: {
          sourceTitle: '${write.title}',
          sourceBody: '${write.body}',
          platforms: '${platforms}'
        }
      },
      {
        id: 'publish',
        type: 'publish',
        input: { contentItemId: '${write.id}', platforms: '${platforms}' }
      }
    ]
  },

  'engagement-sprint': {
    name: '互动冲刺',
    description: '同步 → 分类 → 自动回复 → 转化线索 → 同步CRM',
    steps: [
      {
        id: 'sync',
        type: 'sync-interactions',
        input: { platforms: '${platforms}' }
      },
      {
        id: 'classify',
        type: 'skill',
        skillName: 'lead-classification',
        input: {}
      },
      { id: 'autoreply', type: 'auto-reply', input: {} }
    ]
  }
};

export function getWorkflowTemplate(
  name: string
): WorkflowTemplate | undefined {
  return templates[name];
}

export function listWorkflowTemplates(): Array<{
  name: string;
  template: WorkflowTemplate;
}> {
  return Object.entries(templates).map(([name, template]) => ({
    name,
    template
  }));
}
