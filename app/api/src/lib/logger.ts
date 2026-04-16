type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
const LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'WARN').toUpperCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.WARN;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < getMinLevel()) return;
  const entry: Record<string, unknown> = { level, message, timestamp: new Date().toISOString() };
  if (data && Object.keys(data).length > 0) entry.data = data;
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('DEBUG', message, data),
  info:  (message: string, data?: Record<string, unknown>) => log('INFO',  message, data),
  warn:  (message: string, data?: Record<string, unknown>) => log('WARN',  message, data),
  error: (message: string, data?: Record<string, unknown>) => log('ERROR', message, data),
};
