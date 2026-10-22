import { randomUUID } from 'node:crypto';
import { PROSPECT_GUARD, remainingMs } from '@ai-growth-ops/shared';
import type { DatabaseClient } from './client.js';
import { findProspectingAccount, loadProspectGuard } from './prospect-guard.js';

export async function scheduleProspectingTask(
  db: DatabaseClient,
  taskId: string,
  organizationId: string,
  input: { enabled: boolean; intervalHours?: number | null }
) {
  const task = await db.prospectingTask.findFirst({
    where: { id: taskId, organizationId },
    select: { id: true, platformAccountId: true }
  });
  if (!task) throw new Error('任务不存在');

  const enabled = Boolean(input.enabled);
  if (enabled) {
    if (!task.platformAccountId) {
      throw new Error('任务未绑定执行账号，不能开启定时执行');
    }
    const interval = Number(input.intervalHours ?? 24);
    if (!Number.isInteger(interval) || interval < 1 || interval > 168) {
      throw new Error('执行间隔必须是 1–168 小时');
    }
    const now = new Date();
    return db.prospectingTask.update({
      where: { id: task.id },
      data: {
        scheduleEnabled: true,
        scheduleIntervalHours: interval,
        nextRunAt: new Date(now.getTime() + interval * 60 * 60 * 1000)
      }
    });
  }

  return db.prospectingTask.update({
    where: { id: task.id },
    data: {
      scheduleEnabled: false,
      nextRunAt: null
    }
  });
}

export type ClaimedScheduledProspecting = {
  taskId: string;
  organizationId: string;
  userId: string;
  executionToken: string;
};

export async function claimScheduledProspectingTasks(
  db: DatabaseClient,
  now = new Date(),
  limit = 10
): Promise<{
  claimed: ClaimedScheduledProspecting[];
  skipped: Array<{ taskId: string; reason: string }>;
}> {
  const due = await db.prospectingTask.findMany({
    where: {
      scheduleEnabled: true,
      nextRunAt: { lte: now },
      status: { notIn: ['running'] }
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      platform: true,
      platformAccountId: true,
      scheduleIntervalHours: true,
      status: true
    },
    orderBy: { nextRunAt: 'asc' },
    take: limit
  });

  const claimed: ClaimedScheduledProspecting[] = [];
  const skipped: Array<{ taskId: string; reason: string }> = [];
  const intervalHours = 24;

  for (const task of due) {
    const interval = task.scheduleIntervalHours ?? intervalHours;
    const nextRunAt = new Date(now.getTime() + interval * 60 * 60 * 1000);

    if (!task.platformAccountId) {
      await db.prospectingTask.update({
        where: { id: task.id },
        data: {
          lastError: '定时执行失败：任务未绑定执行账号',
          nextRunAt
        }
      });
      skipped.push({ taskId: task.id, reason: '未绑定执行账号' });
      continue;
    }

    const account = await findProspectingAccount(
      db,
      task.organizationId,
      task.platform,
      task.platformAccountId
    );
    if (!account) {
      await db.prospectingTask.update({
        where: { id: task.id },
        data: {
          lastError: '定时执行失败：账号不可用或登录已失效',
          nextRunAt
        }
      });
      skipped.push({ taskId: task.id, reason: '账号不可用' });
      continue;
    }

    const guard = await loadProspectGuard(
      db,
      task.organizationId,
      task.platformAccountId
    );
    if (remainingMs(guard.captchaBlockedUntil, now.getTime()) > 0) {
      await db.prospectingTask.update({
        where: { id: task.id },
        data: {
          lastError: '定时执行跳过：平台验证码冷却中',
          nextRunAt
        }
      });
      skipped.push({ taskId: task.id, reason: '验证码冷却' });
      continue;
    }
    if (guard.videosCrawled >= PROSPECT_GUARD.dailyVideoLimit) {
      await db.prospectingTask.update({
        where: { id: task.id },
        data: {
          lastError: '定时执行跳过：今日额度已用完',
          nextRunAt
        }
      });
      skipped.push({ taskId: task.id, reason: '今日额度已用完' });
      continue;
    }

    const executionToken = randomUUID();
    const result = await db.prospectingTask.updateMany({
      where: {
        id: task.id,
        scheduleEnabled: true,
        status: { notIn: ['running'] },
        nextRunAt: { lte: now }
      },
      data: {
        status: 'running',
        executionToken,
        startedAt: now,
        finishedAt: null,
        lastRunAt: now,
        nextRunAt,
        lastError: null
      }
    });
    if (result.count === 1) {
      claimed.push({
        taskId: task.id,
        organizationId: task.organizationId,
        userId: task.userId,
        executionToken
      });
    }
  }

  return { claimed, skipped };
}
