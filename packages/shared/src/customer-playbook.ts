import { randomUUID } from 'node:crypto';

export type PlaybookActionType =
  | 'call'
  | 'wecom_message'
  | 'email'
  | 'meeting'
  | 'send_material'
  | 'follow_up_note';

export type PlaybookActionStatus = 'pending' | 'done' | 'skipped';
export type PlaybookStatus = 'draft' | 'active' | 'completed' | 'cancelled';

const PLAYBOOK_STATUS_TRANSITIONS: Record<PlaybookStatus, PlaybookStatus[]> = {
  draft: ['cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

export function canTransitionPlaybookStatus(
  from: PlaybookStatus,
  to: PlaybookStatus
): boolean {
  return PLAYBOOK_STATUS_TRANSITIONS[from].includes(to);
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Date-only dueAt is overdue after that local calendar day. */
export function isPlaybookDueOverdue(
  dueAt: string,
  now: Date = new Date()
): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) {
    return dueAt < localDayKey(now);
  }
  const ts = Date.parse(dueAt);
  return Number.isFinite(ts) && ts < now.getTime();
}

export type PlaybookAction = {
  id: string;
  type: PlaybookActionType;
  title: string;
  content: string;
  dueAt: string | null;
  status: PlaybookActionStatus;
  priority: 'high' | 'medium' | 'low';
};

export type PlaybookGenerateOutput = {
  summary: string;
  reasoning: string;
  actions: PlaybookAction[];
};

export type PlaybookGenerateInput = {
  displayName: string;
  company: string;
  role: string;
  intent: string;
  channel: string;
  status: string;
  segment: string | null;
  fitScore: number;
  intentScore: number;
  healthScore: number;
  profileSummary: string | null;
  painPoints: string[];
  interests: string[];
  recentActivities: Array<{ action: string; note: string | null }>;
};

export type SkillPlaybookAction = {
  type: PlaybookActionType;
  title: string;
  content: string;
  dueInDays?: number;
  priority?: 'high' | 'medium' | 'low';
};

export type SkillPlaybookOutput = {
  summary: string;
  reasoning?: string;
  actions: SkillPlaybookAction[];
};

const SEGMENT_LABELS: Record<string, string> = {
  hot: '高意向',
  warm: '可培育',
  cold: '低活跃',
  at_risk: '流失风险'
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function createAction(
  type: PlaybookActionType,
  title: string,
  content: string,
  dueDays: number,
  priority: 'high' | 'medium' | 'low'
): PlaybookAction {
  return {
    id: randomUUID(),
    type,
    title,
    content,
    dueAt: addDays(dueDays),
    status: 'pending',
    priority
  };
}

export function normalizeSkillPlaybookActions(
  actions: SkillPlaybookAction[]
): PlaybookAction[] {
  return actions.map((a) =>
    createAction(
      a.type,
      a.title,
      a.content,
      a.dueInDays ?? 3,
      a.priority ?? 'medium'
    )
  );
}

export function buildRuleBasedPlaybook(
  input: PlaybookGenerateInput
): PlaybookGenerateOutput {
  const segment = input.segment ?? 'cold';
  const actions: PlaybookAction[] = [];
  const name = input.displayName;
  const pain = input.painPoints[0] ?? '核心需求';
  const interest = input.interests[0] ?? '行业';

  if (segment === 'hot') {
    actions.push(
      createAction(
        'call',
        '电话确认需求',
        `联系${name}，确认「${input.intent}」的具体细节和决策链`,
        0,
        'high'
      ),
      createAction(
        'send_material',
        '发送方案资料',
        `针对${input.company}的${input.role}，发送定制化产品方案`,
        1,
        'high'
      ),
      createAction(
        'meeting',
        '预约演示会议',
        `安排产品演示，聚焦${pain}`,
        3,
        'high'
      )
    );
  } else if (segment === 'warm') {
    actions.push(
      createAction(
        'wecom_message',
        '企微触达',
        `通过企微向${name}发送问候，回顾${input.intent}`,
        1,
        'medium'
      ),
      createAction(
        'send_material',
        '分享案例',
        '发送同行业成功案例，建立信任',
        3,
        'medium'
      ),
      createAction(
        'follow_up_note',
        '跟进意向',
        '记录客户反馈，评估是否进入报价阶段',
        7,
        'medium'
      )
    );
  } else if (segment === 'at_risk') {
    actions.push(
      createAction(
        'call',
        '唤醒电话',
        `${name}已长时间未互动，电话了解是否仍有采购计划`,
        0,
        'high'
      ),
      createAction(
        'wecom_message',
        '关怀消息',
        '发送行业动态或优惠信息，尝试重新激活',
        2,
        'high'
      ),
      createAction(
        'meeting',
        '重建联系',
        '如可行，安排线下或视频会议重建联系',
        5,
        'medium'
      )
    );
  } else {
    actions.push(
      createAction(
        'send_material',
        '培育内容',
        `发送与${interest}相关的有价值的文章或白皮书`,
        3,
        'low'
      ),
      createAction(
        'wecom_message',
        '轻触达',
        '简短问候，不施压，保持品牌认知',
        7,
        'low'
      ),
      createAction(
        'follow_up_note',
        '定期复盘',
        '评估是否升级跟进策略',
        14,
        'low'
      )
    );
  }

  const segmentLabel = SEGMENT_LABELS[segment] ?? segment;
  const summary = `针对${input.company}的${name}（${input.role}），基于「${segmentLabel}」分段，建议 ${actions.length} 步跟进动作。`;
  const reasoning = `Fit ${input.fitScore} / Intent ${input.intentScore} / Health ${input.healthScore}；需求：${input.intent.slice(0, 120)}`;

  return { summary, reasoning, actions };
}

export const PLAYBOOK_ACTION_LABELS: Record<PlaybookActionType, string> = {
  call: '电话',
  wecom_message: '企微消息',
  email: '邮件',
  meeting: '会议',
  send_material: '发送资料',
  follow_up_note: '跟进记录'
};
