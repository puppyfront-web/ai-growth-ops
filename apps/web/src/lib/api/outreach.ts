import { apiDelete, apiGet, apiPost, apiPut } from './client';

export type OutreachChannel =
  | 'official_dm'
  | 'wecom'
  | 'email'
  | 'phone_task'
  | 'manual';

export type OutreachTouchStatus =
  | 'planned'
  | 'due'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'replied';

export type OutreachEnrollmentStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type OutreachStep = {
  id: string;
  sequenceId: string;
  order: number;
  delayHours: number;
  template: string;
  requireReview: boolean;
};

export type OutreachSequence = {
  id: string;
  name: string;
  description: string | null;
  channel: OutreachChannel;
  enabled: boolean;
  steps: OutreachStep[];
  createdAt: string;
};

export type OutreachTouch = {
  id: string;
  channel: OutreachChannel;
  status: OutreachTouchStatus;
  scheduledAt: string;
  content: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  enrollment: {
    id: string;
    customer: {
      id: string;
      displayName: string;
      phone: string;
      company: string;
      intent: string;
      status: string;
    };
    sequence: { id: string; name: string; channel: OutreachChannel };
  };
  step: { id: string; order: number; delayHours: number } | null;
};

export type OutreachEnrollment = {
  id: string;
  status: OutreachEnrollmentStatus;
  stopReason: string | null;
  startedAt: string;
  customer: {
    id: string;
    displayName: string;
    phone: string;
    status: string;
  };
  sequence: { id: string; name: string; channel: OutreachChannel };
  touches: OutreachTouch[];
};

export type OutreachSuppression = {
  id: string;
  type: 'customer' | 'email' | 'phone';
  value: string;
  reason: string | null;
  createdAt: string;
};

export type OutreachWorkbench = {
  due: number;
  sentToday: number;
  repliedToday: number;
  activeEnrollments: number;
  suppressions: number;
};

export type OutreachChannelConfig = Partial<
  Record<OutreachChannel, 'verified' | 'beta' | 'unverified' | 'unsupported'>
>;

export function getOutreachWorkbench(): Promise<OutreachWorkbench> {
  return apiGet('/api/outreach/workbench');
}

export function listOutreachSequences(): Promise<{ items: OutreachSequence[] }> {
  return apiGet('/api/outreach/sequences');
}

export function createOutreachSequence(input: {
  name: string;
  description?: string | null;
  channel: OutreachChannel;
  enabled?: boolean;
  steps: Array<{
    order: number;
    delayHours: number;
    template: string;
    requireReview?: boolean;
  }>;
}): Promise<OutreachSequence> {
  return apiPost('/api/outreach/sequences', input);
}

export function updateOutreachSequence(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    channel: OutreachChannel;
    enabled: boolean;
    steps: Array<{
      order: number;
      delayHours: number;
      template: string;
      requireReview?: boolean;
    }>;
  }>
): Promise<OutreachSequence> {
  return apiPut(`/api/outreach/sequences/${id}`, input);
}

export function deleteOutreachSequence(id: string): Promise<{ deleted: boolean }> {
  return apiDelete(`/api/outreach/sequences/${id}`);
}

export function listOutreachEnrollments(filters?: {
  status?: string;
  customerId?: string;
}): Promise<{ items: OutreachEnrollment[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  const qs = params.toString();
  return apiGet(`/api/outreach/enrollments${qs ? `?${qs}` : ''}`);
}

export function enrollCustomer(input: {
  sequenceId: string;
  customerId: string;
  ownerId?: string | null;
}): Promise<{
  created: boolean;
  enrollment: OutreachEnrollment;
  touch: OutreachTouch | null;
}> {
  return apiPost('/api/outreach/enrollments', input);
}

export function pauseEnrollment(id: string) {
  return apiPost(`/api/outreach/enrollments/${id}/pause`, {});
}

export function resumeEnrollment(id: string) {
  return apiPost(`/api/outreach/enrollments/${id}/resume`, {});
}

export function cancelEnrollment(id: string, reason?: string) {
  return apiPost(`/api/outreach/enrollments/${id}/cancel`, { reason });
}

export function listDueOutreachTouches(): Promise<{ items: OutreachTouch[] }> {
  return apiGet('/api/outreach/touches');
}

export function completeOutreachTouch(
  id: string,
  input: {
    status: 'sent' | 'skipped' | 'replied';
    note?: string;
    externalId?: string;
  }
): Promise<{
  touch: OutreachTouch;
  nextTouch: OutreachTouch | null;
  enrollment: OutreachEnrollment;
}> {
  return apiPost(`/api/outreach/touches/${id}/complete`, input);
}

export function listOutreachSuppressions(): Promise<{
  items: OutreachSuppression[];
}> {
  return apiGet('/api/outreach/suppressions');
}

export function addOutreachSuppression(input: {
  type: 'customer' | 'email' | 'phone';
  value: string;
  reason?: string;
}): Promise<OutreachSuppression> {
  return apiPost('/api/outreach/suppressions', input);
}

export function removeOutreachSuppression(id: string) {
  return apiDelete(`/api/outreach/suppressions/${id}`);
}

export function getOutreachChannelConfig(): Promise<OutreachChannelConfig> {
  return apiGet('/api/outreach/channels');
}

export function updateOutreachChannelConfig(
  input: OutreachChannelConfig
): Promise<{ ok: boolean }> {
  return apiPut('/api/outreach/channels', input);
}

export function scanOutreach(): Promise<{
  markedDue: number;
  escalated: number;
}> {
  return apiPost('/api/outreach/scan', {});
}
