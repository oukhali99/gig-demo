import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger.js';

const origLevel = process.env.LOG_LEVEL;

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  if (origLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = origLevel;
});

/** Parse the JSON the logger wrote on its most recent call. */
function lastEntry(): Record<string, unknown> {
  return JSON.parse(logSpy.mock.calls.at(-1)![0] as string);
}

describe('logger', () => {
  it('emits a structured JSON entry with level, message and timestamp', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    logger.info('hello');
    const entry = lastEntry();
    expect(entry).toMatchObject({ level: 'INFO', message: 'hello' });
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.data).toBeUndefined();
  });

  it('includes the data object when non-empty', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    logger.error('boom', { code: 'X', n: 1 });
    expect(lastEntry().data).toEqual({ code: 'X', n: 1 });
  });

  it('omits an empty data object', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    logger.warn('w', {});
    expect(lastEntry().data).toBeUndefined();
  });

  it('suppresses entries below the configured level', () => {
    process.env.LOG_LEVEL = 'WARN';
    logger.debug('quiet');
    logger.info('also quiet');
    expect(logSpy).not.toHaveBeenCalled();
    logger.warn('loud');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults to WARN when LOG_LEVEL is unset', () => {
    delete process.env.LOG_LEVEL;
    logger.info('quiet');
    expect(logSpy).not.toHaveBeenCalled();
    logger.error('loud');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to WARN for an unrecognized LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'BOGUS';
    logger.info('quiet');
    expect(logSpy).not.toHaveBeenCalled();
    logger.warn('loud');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
