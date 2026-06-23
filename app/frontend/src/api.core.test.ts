import { describe, expect, it, vi } from 'vitest';
import { ApiError, authLogin, authMe, getAuthToken, setAuthToken, setUnauthorizedHandler } from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('ApiError', () => {
  it('carries message, code, and status', () => {
    const err = new ApiError('boom', 'BAD', 422);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(err.code).toBe('BAD');
    expect(err.status).toBe(422);
  });
});

describe('auth token state', () => {
  it('round-trips and clears the token', () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken('abc');
    expect(getAuthToken()).toBe('abc');
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });
});

describe('request() behavior', () => {
  it('issues the request and returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(mockResponse({ idToken: 't', accessToken: 'a', refreshToken: 'r', expiresIn: 3600 }));
    const result = await authLogin('user@example.com', 'pw');
    expect(result).toEqual({ idToken: 't', accessToken: 'a', refreshToken: 'r', expiresIn: 3600 });
    expect(lastUrl()).toBe('/auth/login');
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'user@example.com', password: 'pw' }));
  });

  it('omits the Authorization header when no token is set', async () => {
    fetchMock.mockResolvedValue(mockResponse({ sub: 's1' }));
    await authMe();
    expect((lastInit().headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('adds a Bearer Authorization header when a token is set', async () => {
    setAuthToken('jwt-123');
    fetchMock.mockResolvedValue(mockResponse({ sub: 's1' }));
    await authMe();
    expect((lastInit().headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('throws ApiError carrying the server-provided code and message', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: 'Not found', code: 'NOT_FOUND' }, { status: 404 }));
    await expect(authMe()).rejects.toMatchObject({ message: 'Not found', code: 'NOT_FOUND', status: 404 });
  });

  it('falls back to statusText and UNKNOWN when the error body is empty', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, { status: 500, statusText: 'Server Error' }));
    await expect(authMe()).rejects.toMatchObject({ message: 'Server Error', code: 'UNKNOWN', status: 500 });
  });

  it('tolerates a non-JSON error body', async () => {
    const res = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new SyntaxError('not json');
      },
    } as unknown as Response;
    fetchMock.mockResolvedValue(res);
    await expect(authMe()).rejects.toMatchObject({ message: 'Bad Gateway', code: 'UNKNOWN', status: 502 });
  });
});

describe('401 / unauthorized handling', () => {
  it('invokes the handler on a 401 when authenticated', async () => {
    const handler = vi.fn();
    setAuthToken('jwt');
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(mockResponse({ message: 'nope', code: 'UNAUTHORIZED' }, { status: 401 }));
    await expect(authMe()).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the handler on a 401 when there is no token (e.g. login)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(mockResponse({ message: 'bad creds' }, { status: 401 }));
    await expect(authMe()).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not invoke a cleared handler', async () => {
    const handler = vi.fn();
    setAuthToken('jwt');
    setUnauthorizedHandler(handler);
    setUnauthorizedHandler(null);
    fetchMock.mockResolvedValue(mockResponse({}, { status: 401 }));
    await expect(authMe()).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});
