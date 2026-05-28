export { createLogger, logger } from './logger.js';
export type { Logger, LogLevel, LogEntry } from './logger.js';
export { startSpan, endSpan, addEvent, getActiveSpans } from './tracer.js';
export type { Span } from './tracer.js';
export {
  incrementCounter,
  recordGauge,
  recordHistogram,
  getMetrics,
  getCounter,
  getMetricsSummary,
  clearMetrics,
} from './metrics.js';
export type { MetricEntry } from './metrics.js';
