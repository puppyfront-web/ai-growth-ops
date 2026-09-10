export type AcquisitionChannel =
  | 'douyin'
  | 'xiaohongshu'
  | 'wechat_official'
  | 'wechat_channels'
  | 'baijiahao'
  | 'zhihu'
  | 'manual'
  | 'import'
  | 'referral'
  | 'exhibition'
  | 'phone'
  | 'website'
  | 'partner'
  | 'other';

export type CustomerStatus = 'active' | 'inactive' | 'won' | 'lost';

export type CustomerActivity = {
  id: string;
  customerId: string;
  action: string;
  note: string | null;
  operator: string | null;
  createdAt: string;
  metadata: unknown;
};

export type CustomerProfile = {
  id: string;
  customerId: string;
  industry: string | null;
  companySize: string | null;
  painPoints: unknown;
  interests: unknown;
  budget: string | null;
  timeline: string | null;
  bant: unknown;
  summary: string | null;
  tags: unknown;
  source: string;
  version: number;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaybookActionType =
  | 'call'
  | 'wecom_message'
  | 'email'
  | 'meeting'
  | 'send_material'
  | 'follow_up_note';

export type PlaybookActionStatus = 'pending' | 'done' | 'skipped';

export type PlaybookAction = {
  id: string;
  type: PlaybookActionType;
  title: string;
  content: string;
  dueAt: string | null;
  status: PlaybookActionStatus;
  priority: 'high' | 'medium' | 'low';
};

export type CustomerPlaybookStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'cancelled';

export type CustomerPlaybook = {
  id: string;
  customerId: string;
  summary: string;
  reasoning: string | null;
  actions: PlaybookAction[];
  status: CustomerPlaybookStatus;
  generatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string;
  phone: string;
  company: string;
  role: string;
  intent: string;
  channel: AcquisitionChannel;
  sourceNote: string | null;
  status: CustomerStatus;
  assignedTo: string | null;
  fitScore: number;
  intentScore: number;
  healthScore: number;
  segment: string | null;
  tags: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metadata?: {
    prospectingTaskId?: string;
    prospectCandidateId?: string;
    prospectUserKey?: string;
    relevanceScore?: number;
    leadLevel?: string;
    pendingContact?: boolean;
  } | null;
  activities?: CustomerActivity[];
  leads?: unknown[];
  profile?: CustomerProfile | null;
};

export type CustomerDuplicate = Pick<
  Customer,
  | 'id'
  | 'displayName'
  | 'phone'
  | 'company'
  | 'role'
  | 'intent'
  | 'channel'
  | 'status'
  | 'createdAt'
>;

export type CreateCustomerInput = {
  displayName: string;
  phone: string;
  company: string;
  role: string;
  intent: string;
  channel?: AcquisitionChannel;
  sourceNote?: string;
  assignedTo?: string;
  tags?: string[];
  confirmDuplicate?: boolean;
};

export type UpdateCustomerInput = {
  displayName?: string;
  phone?: string;
  company?: string;
  role?: string;
  intent?: string;
  channel?: AcquisitionChannel;
  sourceNote?: string;
  status?: CustomerStatus;
  assignedTo?: string;
  tags?: string[];
};

export class CustomerDuplicateError extends Error {
  duplicates: CustomerDuplicate[];
  normalizedPhone: string;

  constructor(
    message: string,
    duplicates: CustomerDuplicate[],
    normalizedPhone: string
  ) {
    super(message);
    this.name = 'CustomerDuplicateError';
    this.duplicates = duplicates;
    this.normalizedPhone = normalizedPhone;
  }
}
