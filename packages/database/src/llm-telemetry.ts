import type { DatabaseClient } from './client.js';
import { LLM_ERROR_CODE_LABELS, type LlmErrorCode } from '@ai-growth-ops/shared';

/**
 * LLM 调用遥测（43 号 spec）：ProviderRunLog 此前零写入，
 * token 只在内存 tracker、402 余额耗尽对用户不可见。
 * 这里补齐落库、聚合与告警；记录失败不阻断业务调用。
 */

export type RecordLlmRunInput = {
  organizationId: string;
  provider: string;
  model?: string;
  operation: string;
  status: 'success' | 'failed';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  errorCode?: LlmErrorCode;
  errorMessage?: string;
};

export async function recordLlmRun(
  db: DatabaseClient,
  input: RecordLlmRunInput
): Promise<void> {
  await db.providerRunLog
    .create({
      data: {
        organizationId: input.organizationId,
        providerName: input.provider,
        model: input.model ?? null,
        operation: input.operation,
        status: input.status,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        durationMs: input.durationMs ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage?.slice(0, 500) ?? null,
        startedAt: input.durationMs ? new Date(Date.now() - input.durationMs) : null,
        finishedAt: new Date()
      }
    })
    .catch(() => undefined);
}

export type LlmUsageByModel = {
  provider: string;
  model: string;
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  lastError: { code: string; message: string | null; at: string } | null;
};

export async function getLlmUsageSummary(
  db: DatabaseClient,
  organizationId: string,
  days: number
): Promise<{
  range: { days: number };
  byModel: LlmUsageByModel[];
  lastError: { code: string; message: string | null; at: string; operation: string } | null;
}> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [grouped, lastFailed] = await Promise.all([
    db.providerRunLog.groupBy({
      by: ['providerName', 'model'],
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true
      },
      _avg: { durationMs: true }
    }),
    db.providerRunLog.findFirst({
      where: { organizationId, status: 'failed', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: {
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        operation: true,
        providerName: true,
        model: true
      }
    })
  ]);

  const byModel: LlmUsageByModel[] = [];
  for (const row of grouped) {
    const failureAgg = await db.providerRunLog.aggregate({
      where: {
        organizationId,
        createdAt: { gte: since },
        providerName: row.providerName,
        model: row.model,
        status: 'failed'
      },
      _count: { _all: true }
    });
    const lastModelError = await db.providerRunLog.findFirst({
      where: {
        organizationId,
        createdAt: { gte: since },
        providerName: row.providerName,
        model: row.model,
        status: 'failed'
      },
      orderBy: { createdAt: 'desc' },
      select: { errorCode: true, errorMessage: true, createdAt: true }
    });
    byModel.push({
      provider: row.providerName,
      model: row.model ?? '（默认模型）',
      calls: row._count._all,
      failures: failureAgg._count._all,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
      totalTokens: row._sum.totalTokens ?? 0,
      avgLatencyMs: row._avg.durationMs ?? null,
      lastError: lastModelError
        ? {
            code: lastModelError.errorCode ?? 'error',
            message: lastModelError.errorMessage,
            at: lastModelError.createdAt.toISOString()
          }
        : null
    });
  }

  return {
    range: { days },
    byModel,
    lastError: lastFailed
      ? {
          code: lastFailed.errorCode ?? 'error',
          message: lastFailed.errorMessage,
          at: lastFailed.createdAt.toISOString(),
          operation: lastFailed.operation
        }
      : null
  };
}

/**
 * 余额/鉴权类失败告警：同组织同错误码当日去重。
 * Worker 无法 import API 的 notification-service，按 interaction-pipeline
 * 先例由数据层提供通知写入。
 */
export async function notifyLlmHealthIssue(
  db: DatabaseClient,
  input: { organizationId: string; errorCode: LlmErrorCode; message?: string }
): Promise<void> {
  if (input.errorCode !== 'quota' && input.errorCode !== 'auth') return;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const existing = await db.notification.findFirst({
    where: {
      organizationId: input.organizationId,
      type: 'llm_health',
      title: { contains: input.errorCode },
      createdAt: { gte: startOfDay }
    },
    select: { id: true }
  });
  if (existing) return;

  const label = LLM_ERROR_CODE_LABELS[input.errorCode];
  await db.notification
    .create({
      data: {
        organizationId: input.organizationId,
        type: 'llm_health',
        level: 'critical',
        title: `LLM 调用失败（${input.errorCode}）：${label}`,
        content:
          `${input.message?.slice(0, 300) ?? '（无错误详情）'}\n\n` +
          '语义评分已自动降级为规则评分，AI 相关功能将不可用。' +
          '请到「集成 → LLM」检查 API Key 与账户余额。',
        actionUrl: '/integrations/llm'
      }
    })
    .catch(() => undefined);
}
