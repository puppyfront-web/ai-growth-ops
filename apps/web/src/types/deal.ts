export type DealStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new: '新建',
  contacted: '已联系',
  qualified: '已确认需求',
  proposal: '方案/报价',
  negotiation: '谈判',
  won: '赢单',
  lost: '输单'
};

export const DEAL_STAGE_ORDER: DealStage[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost'
];

export type DealActivity = {
  id: string;
  dealId: string;
  action: string;
  note: string | null;
  operator: string | null;
  createdAt: string;
  metadata: unknown;
};

export type Deal = {
  id: string;
  organizationId: string;
  userId: string;
  customerId: string;
  leadId: string | null;
  title: string;
  stage: DealStage;
  amount: string | null;
  currency: string;
  expectedCloseDate: string | null;
  ownerId: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  lastContactedAt: string | null;
  sourceChannel: string | null;
  sourceContentItemId: string | null;
  sourcePublishJobId: string | null;
  lostReason: string | null;
  wonAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  customer: {
    id: string;
    displayName: string;
    phone: string;
    status: string;
    channel: string;
  };
  lead: {
    id: string;
    status: string;
    level: string;
    externalUserName: string | null;
  } | null;
  activities?: DealActivity[];
};

export type DealPipelineStage = {
  stage: DealStage;
  count: number;
  amount: string;
};

export type DealPipeline = {
  stages: DealPipelineStage[];
  totals: {
    openCount: number;
    openAmount: string;
    wonCount: number;
    wonAmount: string;
  };
};

export type FollowUpOverdueItem = {
  type: 'lead' | 'customer' | 'deal';
  id: string;
  name: string;
  ownerId: string | null;
  nextAction: string | null;
  nextActionAt: string;
  overdueHours: number;
  href: string;
  amount?: string | null;
};

export type CreateDealInput = {
  customerId: string;
  leadId?: string | null;
  title: string;
  stage?: DealStage;
  amount?: number | null;
  currency?: string;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  sourceChannel?: string | null;
  sourceContentItemId?: string | null;
  sourcePublishJobId?: string | null;
  lostReason?: string | null;
};

export type UpdateDealInput = Partial<
  Omit<CreateDealInput, 'customerId'>
> & {
  lostReason?: string | null;
  reopenReason?: string | null;
};
