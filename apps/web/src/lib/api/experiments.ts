import { apiGet, apiPost } from './client';

export type ExperimentVariant = {
  key: string;
  name: string;
  weight: number;
};

export type Experiment = {
  id: string;
  name: string;
  description: string | null;
  metric: string;
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  variants: ExperimentVariant[];
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type ExperimentResults = {
  experiment: Experiment;
  variants: ExperimentVariant[];
  rows: Array<{
    key: string;
    name: string;
    assignments: number;
    conversions: number;
    rate: number;
    lift: number;
    pValue: number;
  }>;
  significant: boolean;
  winnerKey: string | null;
};

export function listExperiments(): Promise<{ items: Experiment[] }> {
  return apiGet('/api/experiments');
}

export function createExperiment(input: {
  name: string;
  description?: string | null;
  metric?: string;
  variants: ExperimentVariant[];
}): Promise<Experiment> {
  return apiPost('/api/experiments', input);
}

export function startExperiment(id: string): Promise<Experiment> {
  return apiPost(`/api/experiments/${id}/start`, {});
}

export function stopExperiment(id: string): Promise<Experiment> {
  return apiPost(`/api/experiments/${id}/stop`, {});
}

export function getExperimentResults(id: string): Promise<ExperimentResults> {
  return apiGet(`/api/experiments/${id}/results`);
}

export function assignExperimentVariant(
  id: string,
  entityType: string,
  entityId: string
): Promise<{ id: string; variantKey: string }> {
  return apiPost(`/api/experiments/${id}/assign`, { entityType, entityId });
}

export function recordExperimentEvent(
  id: string,
  assignmentId: string,
  metric: string,
  value = 1
): Promise<{ id: string }> {
  return apiPost(`/api/experiments/${id}/events`, {
    assignmentId,
    metric,
    value
  });
}
