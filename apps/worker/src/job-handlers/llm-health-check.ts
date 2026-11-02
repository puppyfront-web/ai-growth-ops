import type { Job } from 'bullmq';
import {
  createDatabaseClient,
  notifyLlmHealthIssue,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createLogger } from '@ai-growth-ops/observability';

const logger = createLogger('llm-health-check');

/**
 * 每日 LLM 健康兜底检查（43 号 spec）：
 * 扫描近 24h ProviderRunLog 中 quota/auth 类失败，按组织补发告警
 * （notifyLlmHealthIssue 自带当日去重）。语义评分失败时已有即时告警，
 * 这里兜住其他调用路径与重启丢失通知的场景。被动扫描，不发探测请求。
 */
export async function handleLlmHealthCheck(
  job: Job | { data?: { db?: DatabaseClient } }
): Promise<void> {
  const dbOverride = (job.data as { db?: DatabaseClient } | undefined)?.db;
  const db = dbOverride ?? createDatabaseClient();
  try {
    const since = new Date(Date.now() - 86_400_000);
    const failed = await db.providerRunLog.findMany({
      where: {
        createdAt: { gte: since },
        status: 'failed',
        errorCode: { in: ['quota', 'auth'] }
      },
      select: {
        organizationId: true,
        errorCode: true,
        errorMessage: true
      },
      distinct: ['organizationId', 'errorCode']
    });

    for (const row of failed) {
      if (!row.organizationId) continue;
      await notifyLlmHealthIssue(db, {
        organizationId: row.organizationId,
        errorCode: row.errorCode as 'quota' | 'auth',
        message: row.errorMessage ?? undefined
      });
    }

    if (failed.length > 0) {
      logger.info(
        `[llm-health-check] ${failed.length} 个组织存在 LLM 配额/鉴权失败，已按需告警`
      );
    }
  } finally {
    if (!dbOverride) await db.$disconnect();
  }
}
