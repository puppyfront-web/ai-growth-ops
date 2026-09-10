import { ApiError, apiGet, apiPost, apiPut } from './client';
import type {
  CreateCustomerInput,
  Customer,
  CustomerActivity,
  CustomerDuplicate,
  CustomerPlaybook,
  UpdateCustomerInput
} from '@/types/customer';
import { CustomerDuplicateError } from '@/types/customer';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type CustomerFollowUp = {
  customerId: string;
  displayName: string;
  playbookId: string;
  actionId: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  priority: string;
};

export function listCustomerFollowUps(): Promise<{ items: CustomerFollowUp[] }> {
  return apiGet('/api/customers/follow-ups');
}

export function listCustomers(filters?: {
  status?: string;
  channel?: string;
  source?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<Customer>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.channel) params.set('channel', filters.channel);
  if (filters?.source) params.set('source', filters.source);
  if (filters?.q) params.set('q', filters.q);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
  const qs = params.toString();
  return apiGet<PaginatedResponse<Customer>>(
    `/api/customers${qs ? `?${qs}` : ''}`
  );
}

export function getCustomer(id: string): Promise<Customer> {
  return apiGet<Customer>(`/api/customers/${id}`);
}

export function checkCustomerDuplicate(
  phone: string
): Promise<{ duplicates: CustomerDuplicate[]; normalizedPhone: string }> {
  const params = new URLSearchParams({ phone });
  return apiGet(`/api/customers/check-duplicate?${params.toString()}`);
}

export async function createCustomer(
  data: CreateCustomerInput
): Promise<Customer> {
  try {
    return await apiPost<Customer>('/api/customers', data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new CustomerDuplicateError(
        error.message || '存在重复客户',
        (error.payload.duplicates as CustomerDuplicate[] | undefined) ?? [],
        String(error.payload.normalizedPhone ?? data.phone)
      );
    }
    throw error;
  }
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomerInput
): Promise<Customer> {
  try {
    return await apiPut<Customer>(`/api/customers/${id}`, data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new CustomerDuplicateError(
        error.message || '该手机号已被其他客户使用',
        (error.payload.duplicates as CustomerDuplicate[] | undefined) ?? [],
        String(error.payload.normalizedPhone ?? data.phone ?? '')
      );
    }
    throw error;
  }
}

export function addCustomerActivity(
  customerId: string,
  action: string,
  note?: string
): Promise<CustomerActivity> {
  return apiPost<CustomerActivity>(`/api/customers/${customerId}/activities`, {
    action,
    note
  });
}

export type CustomerImportPreviewResult = {
  headers: string[];
  suggestedMapping: Record<string, number>;
  mapping: Record<string, number>;
  rows: Array<{
    rowNumber: number;
    data: Record<string, string | undefined>;
    issues: string[];
    existingCustomer?: {
      id: string;
      displayName: string;
      phone: string;
      company: string;
    };
  }>;
  summary: {
    total: number;
    ready: number;
    invalid: number;
    duplicateDb: number;
    duplicateFile: number;
  };
};

export function previewCustomerImport(
  csv: string,
  mapping?: Record<string, number>
): Promise<CustomerImportPreviewResult> {
  return apiPost('/api/customers/import/preview', { csv, mapping });
}

export function executeCustomerImport(
  csv: string,
  mapping?: Record<string, number>,
  options?: { skipDuplicates?: boolean }
): Promise<{
  created: number;
  skipped: number;
  errors: string[];
  createdCustomerIds: string[];
}> {
  return apiPost('/api/customers/import', {
    csv,
    mapping,
    skipDuplicates: options?.skipDuplicates ?? true
  });
}

export function getCustomerProfile(customerId: string) {
  return apiGet<{
    customerId: string;
    fitScore: number;
    intentScore: number;
    healthScore: number;
    segment: string | null;
    profile: import('@/types/customer').CustomerProfile | null;
  }>(`/api/customers/${customerId}/profile`);
}

export function refreshCustomerProfile(customerId: string) {
  return apiPost(`/api/customers/${customerId}/profile/refresh`, {});
}

export function getCustomerPlaybook(customerId: string) {
  return apiGet<{ playbook: CustomerPlaybook | null }>(
    `/api/customers/${customerId}/playbook`
  );
}

export function generateCustomerPlaybook(customerId: string) {
  return apiPost<{ playbook: CustomerPlaybook; generatedBy: string }>(
    `/api/customers/${customerId}/playbook/generate`,
    {}
  );
}

export function approveCustomerPlaybook(
  customerId: string,
  playbookId: string
) {
  return apiPost<{ playbook: CustomerPlaybook }>(
    `/api/customers/${customerId}/playbook/${playbookId}/approve`,
    {}
  );
}

export function updateCustomerPlaybook(
  customerId: string,
  playbookId: string,
  data: {
    status?: CustomerPlaybook['status'];
    actions?: CustomerPlaybook['actions'];
  }
) {
  return apiPut<{ playbook: CustomerPlaybook }>(
    `/api/customers/${customerId}/playbook/${playbookId}`,
    data
  );
}
