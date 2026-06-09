export interface MetricEntry {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

const metrics: MetricEntry[] = [];
const counters = new Map<string, number>();

export function incrementCounter(
  name: string,
  tags?: Record<string, string>,
  value = 1
): void {
  const key = `${name}:${JSON.stringify(tags || {})}`;
  const current = counters.get(key) || 0;
  counters.set(key, current + value);
  metrics.push({
    name,
    value: current + value,
    timestamp: Date.now(),
    tags,
    type: 'counter'
  });
}

export function recordGauge(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  metrics.push({ name, value, timestamp: Date.now(), tags, type: 'gauge' });
}

export function recordHistogram(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  metrics.push({ name, value, timestamp: Date.now(), tags, type: 'histogram' });
}

export function getMetrics(name?: string, limit = 100): MetricEntry[] {
  let result = metrics;
  if (name) result = result.filter((m) => m.name === name);
  return result.slice(-limit);
}

export function getCounter(
  name: string,
  tags?: Record<string, string>
): number {
  const key = `${name}:${JSON.stringify(tags || {})}`;
  return counters.get(key) || 0;
}

export function getMetricsSummary(): Record<
  string,
  { count: number; latest: number; sum: number }
> {
  const summary: Record<
    string,
    { count: number; latest: number; sum: number }
  > = {};
  for (const metric of metrics) {
    if (!summary[metric.name]) {
      summary[metric.name] = { count: 0, latest: 0, sum: 0 };
    }
    summary[metric.name].count++;
    summary[metric.name].latest = metric.value;
    summary[metric.name].sum += metric.value;
  }
  return summary;
}

export function clearMetrics(): void {
  metrics.length = 0;
  counters.clear();
}
