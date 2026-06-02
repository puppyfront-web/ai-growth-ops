/**
 * Notification Service
 *
 * Centralized notification creation that replaces scattered createNotification calls.
 * Each method creates the notification AND fires the webhook event.
 */

import type { DatabaseClient } from '@ai-growth-ops/database';
import { writeAuditLog } from '../routes-audit.js';
import { fireWebhook } from './webhook-service.js';

interface NotificationInput {
  db: DatabaseClient;
  userId: string;
  organizationId: string;
}

// ── Publish Events ─────────────────────────────────────────────────────────

export async function onPublishCompleted(
  ctx: NotificationInput & { publishJobId: string; platform: string; externalUrl?: string; contentTitle?: string },
): Promise<void> {
  const { db, userId, organizationId, publishJobId, platform, externalUrl, contentTitle } = ctx;

  await db.notification.create({
    data: {
      type: 'publish',
      title: '发布完成',
      content: `"${contentTitle || '内容'}" 已成功发布到 ${platform}`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: externalUrl || `/publish/jobs/${publishJobId}`,
    },
  });

  await fireWebhook(db, organizationId, 'publish.completed', {
    publishJobId,
    platform,
    externalUrl,
    contentTitle,
  });
}

export async function onPublishFailed(
  ctx: NotificationInput & { publishJobId: string; platform: string; errorMessage: string; contentTitle?: string },
): Promise<void> {
  const { db, userId, organizationId, publishJobId, platform, errorMessage, contentTitle } = ctx;

  await db.notification.create({
    data: {
      type: 'publish',
      title: '发布失败',
      content: `"${contentTitle || '内容'}" 发布到 ${platform} 失败: ${errorMessage.substring(0, 100)}`,
      level: 'error',
      userId,
      organizationId,
      actionUrl: `/publish/jobs/${publishJobId}`,
    },
  });

  await fireWebhook(db, organizationId, 'publish.failed', {
    publishJobId,
    platform,
    errorMessage,
  });
}

export async function onPublishNeedsHumanConfirm(
  ctx: NotificationInput & { publishJobId: string; platform: string; reason?: string },
): Promise<void> {
  const { db, userId, organizationId, publishJobId, platform, reason } = ctx;

  await db.notification.create({
    data: {
      type: 'publish',
      title: '需要人工确认',
      content: `发布到 ${platform} 的任务需要人工确认${reason ? `: ${reason}` : ''}`,
      level: 'warning',
      userId,
      organizationId,
      actionUrl: `/publish/jobs/${publishJobId}`,
    },
  });

  await fireWebhook(db, organizationId, 'publish.needs_human', {
    publishJobId,
    platform,
    reason,
  });
}

// ── Lead Events ────────────────────────────────────────────────────────────

export async function onLeadCreated(
  ctx: NotificationInput & { leadId: string; leadName?: string; source?: string },
): Promise<void> {
  const { db, userId, organizationId, leadId, leadName, source } = ctx;

  await db.notification.create({
    data: {
      type: 'lead',
      title: '新线索',
      content: `收到新线索: ${leadName || leadId}${source ? ` (来源: ${source})` : ''}`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: `/leads`,
    },
  });

  await fireWebhook(db, organizationId, 'lead.created', {
    leadId,
    leadName,
    source,
  });
}

export async function onLeadScoreChanged(
  ctx: NotificationInput & { leadId: string; leadName?: string; oldScore: number; newScore: number },
): Promise<void> {
  const { db, userId, organizationId, leadId, leadName, oldScore, newScore } = ctx;

  // Only notify on significant score changes (>= 10 point jump)
  if (Math.abs(newScore - oldScore) < 10) return;

  await db.notification.create({
    data: {
      type: 'lead',
      title: '线索评分变化',
      content: `"${leadName || leadId}" 评分从 ${oldScore} 变为 ${newScore}`,
      level: newScore > oldScore ? 'info' : 'warning',
      userId,
      organizationId,
      actionUrl: `/leads`,
    },
  });
}

// ── Interaction Events ─────────────────────────────────────────────────────

export async function onNewComment(
  ctx: NotificationInput & { interactionId: string; platform: string; commenterName?: string; contentPreview?: string },
): Promise<void> {
  const { db, userId, organizationId, interactionId, platform, commenterName, contentPreview } = ctx;

  await db.notification.create({
    data: {
      type: 'interaction',
      title: '新评论',
      content: `${commenterName || '用户'} 在 ${platform} 评论: "${(contentPreview || '').substring(0, 50)}"`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: `/conversations/comments`,
    },
  });

  await fireWebhook(db, organizationId, 'interaction.comment', {
    interactionId,
    platform,
    commenterName,
  });
}

export async function onNewMessage(
  ctx: NotificationInput & { interactionId: string; platform: string; senderName?: string; contentPreview?: string },
): Promise<void> {
  const { db, userId, organizationId, interactionId, platform, senderName, contentPreview } = ctx;

  await db.notification.create({
    data: {
      type: 'interaction',
      title: '新私信',
      content: `${senderName || '用户'} 在 ${platform} 发来私信: "${(contentPreview || '').substring(0, 50)}"`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: `/conversations/messages`,
    },
  });

  await fireWebhook(db, organizationId, 'interaction.message', {
    interactionId,
    platform,
    senderName,
  });
}

// ── Research Events ────────────────────────────────────────────────────────

export async function onResearchCompleted(
  ctx: NotificationInput & { taskId: string; taskTitle?: string; insightCount: number },
): Promise<void> {
  const { db, userId, organizationId, taskId, taskTitle, insightCount } = ctx;

  await db.notification.create({
    data: {
      type: 'research',
      title: '调研完成',
      content: `"${taskTitle || taskId}" 调研完成，发现 ${insightCount} 条洞察`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: `/research`,
    },
  });

  await fireWebhook(db, organizationId, 'research.completed', {
    taskId,
    insightCount,
  });
}

// ── System Events ──────────────────────────────────────────────────────────

export async function onSystemError(
  ctx: NotificationInput & { error: string; module: string },
): Promise<void> {
  const { db, userId, organizationId, error, module } = ctx;

  await db.notification.create({
    data: {
      type: 'system',
      title: '系统异常',
      content: `[${module}] ${error.substring(0, 120)}`,
      level: 'error',
      userId,
      organizationId,
    },
  });

  await fireWebhook(db, organizationId, 'system.error', {
    error,
    module,
  });
}

export async function onPlatformAccountExpired(
  ctx: NotificationInput & { platformAccountId: string; platform: string; accountName: string },
): Promise<void> {
  const { db, userId, organizationId, platformAccountId, platform, accountName } = ctx;

  await db.notification.create({
    data: {
      type: 'integration',
      title: '平台授权过期',
      content: `${platform} 账号 "${accountName}" 的授权已过期，请重新连接`,
      level: 'warning',
      userId,
      organizationId,
      actionUrl: `/integrations/platforms`,
    },
  });

  await fireWebhook(db, organizationId, 'integration.expired', {
    platformAccountId,
    platform,
  });
}

// ── Team Events ────────────────────────────────────────────────────────────

export async function onMemberJoined(
  ctx: NotificationInput & { newMemberName: string; orgName: string },
): Promise<void> {
  const { db, userId, organizationId, newMemberName, orgName } = ctx;

  await db.notification.create({
    data: {
      type: 'team',
      title: '新成员加入',
      content: `${newMemberName} 加入了组织 ${orgName}`,
      level: 'info',
      userId,
      organizationId,
      actionUrl: `/settings/team`,
    },
  });

  await writeAuditLog(db, {
    userId,
    organizationId,
    action: 'create',
    entity: 'OrganizationMember',
    entityId: userId,
  });
}

// ── Batch helpers ──────────────────────────────────────────────────────────

/**
 * Get unread notification count for a user/org (used by NotificationBell)
 */
export async function getUnreadCount(
  db: DatabaseClient,
  organizationId: string,
  userId?: string,
): Promise<number> {
  const where: Record<string, unknown> = {
    organizationId,
    readAt: null,
  };
  if (userId) where.userId = userId;
  return db.notification.count({ where });
}

/**
 * Mark notifications as read
 */
export async function markNotificationsRead(
  db: DatabaseClient,
  notificationIds: string[],
): Promise<void> {
  await db.notification.updateMany({
    where: { id: { in: notificationIds } },
    data: { readAt: new Date() },
  });
}
