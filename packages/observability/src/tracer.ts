import { randomUUID } from 'crypto';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

const activeSpans = new Map<string, Span>();

export function startSpan(operation: string, parentSpanId?: string, attributes?: Record<string, unknown>): Span {
  const traceId = parentSpanId || randomUUID();
  const span: Span = {
    traceId,
    spanId: randomUUID(),
    parentSpanId,
    operation,
    startTime: Date.now(),
    status: 'ok',
    attributes: attributes || {},
    events: [],
  };
  activeSpans.set(span.spanId, span);
  return span;
}

export function endSpan(span: Span, status: 'ok' | 'error' = 'ok'): void {
  span.endTime = Date.now();
  span.status = status;
  activeSpans.delete(span.spanId);

  const duration = span.endTime - span.startTime;
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(JSON.stringify({
      traceId: span.traceId,
      spanId: span.spanId,
      operation: span.operation,
      durationMs: duration,
      status: span.status,
      attributes: span.attributes,
    }));
  }
}

export function addEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
  span.events.push({ name, timestamp: Date.now(), attributes });
}

export function getActiveSpans(): Span[] {
  return Array.from(activeSpans.values());
}
