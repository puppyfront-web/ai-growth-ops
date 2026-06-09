export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(context: string): Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function getMinLevel(): LogLevel {
  return (process.env.LOG_LEVEL as LogLevel) || 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getMinLevel()];
}

function formatEntry(entry: LogEntry): string {
  const { timestamp, level, message, context, ...rest } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}]${context ? ` [${context}]` : ''}`;
  const metaKeys = Object.keys(rest).filter(
    (k) => !['timestamp', 'level', 'message', 'context'].includes(k)
  );
  if (metaKeys.length === 0) return `${prefix} ${message}`;
  return `${prefix} ${message} ${JSON.stringify(rest)}`;
}

export function createLogger(defaultContext?: string): Logger {
  function log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: defaultContext,
      ...meta
    };

    const formatted = formatEntry(entry);
    switch (level) {
      case 'error':
        process.stderr.write(formatted + '\n');
        break;
      default:
        process.stdout.write(formatted + '\n');
    }
  }

  return {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    child: (context) =>
      createLogger(defaultContext ? `${defaultContext}:${context}` : context)
  };
}

export const logger = createLogger();
