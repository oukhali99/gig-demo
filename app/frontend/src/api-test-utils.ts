import { afterEach, beforeEach, vi } from 'vitest';
import { setAuthToken, setUnauthorizedHandler } from './api';

/** Shared fetch spy. Reset before every test by `setupApiTest()`. */
export const fetchMock = vi.fn();

/** Build a minimal Response-like object matching what `api.ts` reads. */
export function mockResponse(
  body: unknown,
  init: { status?: number; statusText?: string } = {}
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? '',
    json: async () => body,
  } as unknown as Response;
}

/** The URL string the most recent fetch call was made with. */
export function lastUrl(): string {
  return fetchMock.mock.calls.at(-1)![0] as string;
}

/** The RequestInit the most recent fetch call was made with. */
export function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit;
}

/**
 * Register beforeEach/afterEach hooks that stub global fetch and reset the
 * module-level auth state that persists across tests. Call once per suite file.
 */
export function setupApiTest(): void {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken(null);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
