export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const
  },
  dashboard: {
    all: ['dashboard'] as const,
    trends: (range: string) => ['dashboard', 'trends', range] as const
  },
  research: {
    tasks: ['research', 'tasks'] as const,
    task: (id: string) => ['research', 'task', id] as const,
    posts: (taskId: string) => ['research', 'task', taskId, 'posts'] as const,
    comments: (taskId: string) =>
      ['research', 'task', taskId, 'comments'] as const,
    insights: ['research', 'insights'] as const,
    opportunities: ['research', 'opportunities'] as const
  },
  content: {
    items: ['content', 'items'] as const,
    item: (id: string) => ['content', 'item', id] as const,
    variants: (itemId: string) =>
      ['content', 'item', itemId, 'variants'] as const
  },
  media: {
    assets: ['media', 'assets'] as const
  },
  publish: {
    jobs: ['publish', 'jobs'] as const,
    job: (id: string) => ['publish', 'job', id] as const,
    attempts: (jobId: string) => ['publish', 'job', jobId, 'attempts'] as const
  },
  interactions: {
    all: ['interactions'] as const,
    detail: (id: string) => ['interactions', id] as const
  },
  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', id] as const,
    replies: ['conversations', 'replies'] as const
  },
  leads: {
    all: ['leads'] as const,
    lead: (id: string) => ['leads', id] as const,
    activities: (leadId: string) => ['leads', leadId, 'activities'] as const,
    sinks: (type: string) => ['leads', 'sinks', type] as const
  },
  analytics: {
    overview: ['analytics', 'overview'] as const,
    platforms: ['analytics', 'platforms'] as const,
    contentRoi: ['analytics', 'content-roi'] as const,
    leadTrend: ['analytics', 'lead-trend'] as const,
    platformTrend: ['analytics', 'platform-trend'] as const,
    events: ['analytics', 'events'] as const
  },
  integrations: {
    accounts: ['integrations', 'accounts'] as const,
    providers: ['integrations', 'providers'] as const,
    feishu: ['integrations', 'feishu'] as const,
    wecom: ['integrations', 'wecom'] as const
  },
  settings: {
    ai: ['settings', 'ai'] as const,
    skills: ['settings', 'skills'] as const,
    compliance: ['settings', 'compliance'] as const
  },
  notifications: {
    all: ['notifications'] as const
  },
  agent: {
    runs: ['agent', 'runs'] as const,
    run: (id: string) => ['agent', 'run', id] as const
  },
  audit: {
    logs: ['audit', 'logs'] as const
  },
  tasks: {
    all: ['tasks'] as const
  }
} as const;
