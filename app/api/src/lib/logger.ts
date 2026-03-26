export function isDev(): boolean {
  return process.env.ENVIRONMENT === 'dev';
}

export function devLog(message: string, data?: Record<string, unknown>): void {
  if (isDev()) console.log(JSON.stringify({ level: 'DEBUG', message, ...data }));
}
