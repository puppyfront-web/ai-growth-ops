export const DEFAULT_RETRY = {
  maxRetries: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
};

export const PUBLISH_RETRY = {
  maxRetries: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 10000,
  },
};

export const SYNC_RETRY = {
  maxRetries: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 15000,
  },
};

export const RESEARCH_RETRY = {
  maxRetries: 2,
  backoff: {
    type: 'exponential' as const,
    delay: 60000,
  },
};
