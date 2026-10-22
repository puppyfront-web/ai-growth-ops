/**
 * Outreach rules shared by API, Worker and Web.
 *
 * Sending is deliberately conservative: only verified channels (plus manual
 * tasks) may send automatically, and every send passes suppression, frequency
 * and quiet-hour guards.
 */

export const OUTREACH_CHANNELS = [
  'official_dm',
  'wecom',
  'email',
  'phone_task',
  'manual'
] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_CHANNEL_LABELS: Record<OutreachChannel, string> = {
  official_dm: '平台私信',
  wecom: '企业微信',
  email: '邮件',
  phone_task: '电话任务',
  manual: '人工记录'
};

export const OUTREACH_TOUCH_STATUSES = [
  'planned',
  'due',
  'sending',
  'sent',
  'failed',
  'skipped',
  'replied'
] as const;

export type OutreachTouchStatus = (typeof OUTREACH_TOUCH_STATUSES)[number];

export const OUTREACH_ENROLLMENT_STATUSES = [
  'active',
  'paused',
  'completed',
  'cancelled'
] as const;

export type OutreachEnrollmentStatus =
  (typeof OUTREACH_ENROLLMENT_STATUSES)[number];

export type OutreachChannelCapability =
  | 'verified'
  | 'beta'
  | 'unverified'
  | 'unsupported';

export type OutreachGuardInput = {
  channel: OutreachChannel;
  channelStatus: OutreachChannelCapability;
  suppressed: boolean;
  dailySent: number;
  weeklySent: number;
  email?: string | null;
  officialAccountId?: string | null;
  now?: Date;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxDaily?: number;
  maxWeekly?: number;
};

export type OutreachGuardResult = {
  allowed: boolean;
  reason?: string;
  code?:
    | 'suppressed'
    | 'channel_unverified'
    | 'missing_identifier'
    | 'frequency'
    | 'quiet_hours';
};

const DEFAULT_MAX_DAILY = 1;
const DEFAULT_MAX_WEEKLY = 3;
const DEFAULT_QUIET_START = '22:00';
const DEFAULT_QUIET_END = '08:00';

function parseHourMinute(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isQuietHour(
  now: Date,
  quietHoursStart = DEFAULT_QUIET_START,
  quietHoursEnd = DEFAULT_QUIET_END
): boolean {
  const start = parseHourMinute(quietHoursStart);
  const end = parseHourMinute(quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function computeTouchSchedule(
  delaysHours: number[],
  startAt: Date
): Date[] {
  for (const delay of delaysHours) {
    if (!Number.isFinite(delay) || delay < 0) {
      throw new Error('触达间隔必须是非负数');
    }
  }
  return delaysHours.map(
    (delay) => new Date(startAt.getTime() + delay * 60 * 60 * 1000)
  );
}

export function checkOutreachGuard(
  input: OutreachGuardInput
): OutreachGuardResult {
  if (input.suppressed) {
    return {
      allowed: false,
      code: 'suppressed',
      reason: '客户在退订/黑名单中'
    };
  }

  const manualChannel =
    input.channel === 'manual' || input.channel === 'phone_task';
  if (!manualChannel && input.channelStatus !== 'verified') {
    return {
      allowed: false,
      code: 'channel_unverified',
      reason: '该渠道尚未完成真实验收，只能生成人工任务'
    };
  }

  if (input.channel === 'email' && !input.email?.trim()) {
    return {
      allowed: false,
      code: 'missing_identifier',
      reason: '客户缺少邮箱'
    };
  }
  if (
    input.channel === 'official_dm' &&
    !input.officialAccountId?.trim()
  ) {
    return {
      allowed: false,
      code: 'missing_identifier',
      reason: '缺少可用的平台账号'
    };
  }

  if (input.dailySent >= (input.maxDaily ?? DEFAULT_MAX_DAILY)) {
    return {
      allowed: false,
      code: 'frequency',
      reason: '今日触达次数已达上限'
    };
  }
  if (input.weeklySent >= (input.maxWeekly ?? DEFAULT_MAX_WEEKLY)) {
    return {
      allowed: false,
      code: 'frequency',
      reason: '本周触达次数已达上限'
    };
  }

  const now = input.now ?? new Date();
  if (
    isQuietHour(
      now,
      input.quietHoursStart ?? DEFAULT_QUIET_START,
      input.quietHoursEnd ?? DEFAULT_QUIET_END
    )
  ) {
    return {
      allowed: false,
      code: 'quiet_hours',
      reason: '当前处于静默时段'
    };
  }

  return { allowed: true };
}

export function shouldStopEnrollment(input: {
  replied?: boolean;
  outcome?: 'won' | 'lost' | null;
  paused?: boolean;
  cancelled?: boolean;
}): string | null {
  if (input.cancelled) return 'cancelled';
  if (input.paused) return 'paused';
  if (input.replied) return 'replied';
  if (input.outcome) return input.outcome;
  return null;
}

export function applyOutreachTemplate(
  template: string,
  variables: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value == null ? '' : String(value).trim();
  });
}

export function nextTouchStatus(
  scheduledAt: string | Date,
  now: Date = new Date()
): Extract<OutreachTouchStatus, 'planned' | 'due'> {
  const time =
    scheduledAt instanceof Date
      ? scheduledAt.getTime()
      : Date.parse(String(scheduledAt));
  if (!Number.isFinite(time)) return 'planned';
  return time <= now.getTime() ? 'due' : 'planned';
}
