import { apiDelete, apiGet, apiPost, apiPut } from './client';

export type CaptureFieldType = 'text' | 'tel' | 'email' | 'textarea';

export type CaptureField = {
  key: string;
  label: string;
  type: CaptureFieldType;
  required?: boolean;
};

export type CaptureForm = {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string | null;
  fields: CaptureField[];
  enabled: boolean;
  submitMessage: string | null;
  createdAt: string;
};

export type PublicCaptureForm = Pick<
  CaptureForm,
  'id' | 'name' | 'slug' | 'title' | 'description' | 'fields' | 'submitMessage'
>;

export type CaptureSubmission = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  message: string | null;
  createdAt: string;
  customer: { id: string; displayName: string; status: string } | null;
};

export type AssignmentRule = {
  id: string;
  name: string;
  priority: number;
  conditions: {
    channel?: string;
    level?: string;
    industry?: string;
    region?: string;
  };
  assigneeId: string | null;
  strategy: 'fixed' | 'least_loaded';
  enabled: boolean;
};

export function listCaptureForms(): Promise<{ items: CaptureForm[] }> {
  return apiGet('/api/forms');
}

export function createCaptureForm(input: {
  name: string;
  slug: string;
  title: string;
  description?: string | null;
  fields: CaptureField[];
  enabled?: boolean;
  submitMessage?: string | null;
}): Promise<CaptureForm> {
  return apiPost('/api/forms', input);
}

export function updateCaptureForm(
  id: string,
  input: Partial<{
    name: string;
    title: string;
    description: string | null;
    fields: CaptureField[];
    enabled: boolean;
    submitMessage: string | null;
  }>
): Promise<CaptureForm> {
  return apiPut(`/api/forms/${id}`, input);
}

export function deleteCaptureForm(id: string) {
  return apiDelete(`/api/forms/${id}`);
}

export function listCaptureSubmissions(
  formId: string
): Promise<{ items: CaptureSubmission[] }> {
  return apiGet(`/api/forms/${formId}/submissions`);
}

export function getPublicCaptureForm(
  slug: string
): Promise<PublicCaptureForm> {
  return apiGet(`/api/public/forms/${slug}`);
}

export function submitPublicCaptureForm(
  slug: string,
  input: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    message?: string;
  }
): Promise<{ ok: boolean; message: string; submissionId: string }> {
  return apiPost(`/api/public/forms/${slug}/submit`, input);
}

export function listAssignmentRules(): Promise<{ items: AssignmentRule[] }> {
  return apiGet('/api/settings/assignment-rules');
}

export function createAssignmentRule(input: {
  name: string;
  priority?: number;
  conditions: AssignmentRule['conditions'];
  assigneeId?: string | null;
  strategy?: 'fixed' | 'least_loaded';
  enabled?: boolean;
}): Promise<AssignmentRule> {
  return apiPost('/api/settings/assignment-rules', input);
}

export function updateAssignmentRule(
  id: string,
  input: Partial<{
    name: string;
    priority: number;
    conditions: AssignmentRule['conditions'];
    assigneeId: string | null;
    strategy: 'fixed' | 'least_loaded';
    enabled: boolean;
  }>
): Promise<AssignmentRule> {
  return apiPut(`/api/settings/assignment-rules/${id}`, input);
}

export function deleteAssignmentRule(id: string) {
  return apiDelete(`/api/settings/assignment-rules/${id}`);
}
