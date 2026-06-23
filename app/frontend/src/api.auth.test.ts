import { describe, expect, it } from 'vitest';
import {
  authConfirm,
  authMe,
  authRefresh,
  authRegister,
  authResendConfirmation,
} from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('auth', () => {
  it('authRegister POSTs credentials and returns the new sub', async () => {
    fetchMock.mockResolvedValue(mockResponse({ sub: 'new-sub' }));
    const result = await authRegister('a@b.c', 'pw');
    expect(result).toEqual({ sub: 'new-sub' });
    expect(lastUrl()).toBe('/auth/register');
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c', password: 'pw' }));
  });

  it('authRefresh POSTs the refresh token', async () => {
    fetchMock.mockResolvedValue(mockResponse({ idToken: 'i', accessToken: 'a', expiresIn: 3600 }));
    const result = await authRefresh('refresh-1');
    expect(result).toEqual({ idToken: 'i', accessToken: 'a', expiresIn: 3600 });
    expect(lastUrl()).toBe('/auth/refresh');
    expect(lastInit().body).toBe(JSON.stringify({ refreshToken: 'refresh-1' }));
  });

  it('authMe GETs the current user', async () => {
    fetchMock.mockResolvedValue(mockResponse({ sub: 's1', email: 'a@b.c', role: 'admin' }));
    const result = await authMe();
    expect(result).toEqual({ sub: 's1', email: 'a@b.c', role: 'admin' });
    expect(lastUrl()).toBe('/auth/me');
  });

  it('authConfirm POSTs the email and code', async () => {
    fetchMock.mockResolvedValue(mockResponse(null));
    await authConfirm('a@b.c', '123456');
    expect(lastUrl()).toBe('/auth/confirm');
    expect(lastInit().body).toBe(JSON.stringify({ email: 'a@b.c', code: '123456' }));
  });

  it('authResendConfirmation POSTs the email', async () => {
    fetchMock.mockResolvedValue(mockResponse(null));
    await authResendConfirmation('a@b.c');
    expect(lastUrl()).toBe('/auth/resend-confirmation');
    expect(lastInit().body).toBe(JSON.stringify({ email: 'a@b.c' }));
  });
});
