export interface RuntimeConfig {
  environment: string;
  dataDir: string;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    environment: process.env.NODE_ENV ?? 'development',
    dataDir: process.env.AI_GROWTH_OPS_DATA_DIR ?? 'data',
  };
}
