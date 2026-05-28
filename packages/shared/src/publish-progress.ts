export type PublishProgressStage =
  | 'queued'
  | 'starting'
  | 'browser_launch'
  | 'browser_page'
  | 'browser_fill'
  | 'browser_submit'
  | 'api_publish'
  | 'done'
  | 'failed';

export type PublishProgressSnapshot = {
  stage: PublishProgressStage;
  label: string;
  percent: number;
  message?: string;
  updatedAt: string;
};

const STAGE_LABELS: Record<PublishProgressStage, string> = {
  queued: '已入队，等待执行',
  starting: 'Worker 已开始处理',
  browser_launch: '启动浏览器自动化',
  browser_page: '打开创作者发布页',
  browser_fill: '填写标题与正文',
  browser_submit: '提交发布',
  api_publish: '调用平台接口发布',
  done: '发布完成',
  failed: '发布失败',
};

const STAGE_PERCENT: Record<PublishProgressStage, number> = {
  queued: 5,
  starting: 10,
  browser_launch: 25,
  browser_page: 45,
  browser_fill: 65,
  browser_submit: 85,
  api_publish: 50,
  done: 100,
  failed: 0,
};

export function buildPublishProgress(
  stage: PublishProgressStage,
  message?: string
): PublishProgressSnapshot {
  return {
    stage,
    label: STAGE_LABELS[stage],
    percent: STAGE_PERCENT[stage],
    message,
    updatedAt: new Date().toISOString(),
  };
}

export function parsePublishProgress(metadata: unknown): PublishProgressSnapshot | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const progress = (metadata as Record<string, unknown>).progress;
  if (!progress || typeof progress !== 'object') return null;
  const p = progress as Record<string, unknown>;
  const stage = p.stage as PublishProgressStage;
  if (!stage || !(stage in STAGE_LABELS)) return null;
  return {
    stage,
    label: typeof p.label === 'string' ? p.label : STAGE_LABELS[stage],
    percent: typeof p.percent === 'number' ? p.percent : STAGE_PERCENT[stage],
    message: typeof p.message === 'string' ? p.message : undefined,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
  };
}
