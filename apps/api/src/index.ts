import { createHealthSnapshot } from '@ai-growth-ops/shared';

export const appName = 'api';

export const getApiHealth = () => createHealthSnapshot(appName);

export * from './mvp-service';
export * from './server';
