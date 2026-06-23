import { describe, expect, it } from 'vitest';
import { getUser, stripeOnboard, stripeStatus, updateUser } from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('users', () => {
  it('getUser percent-encodes the sub', async () => {
    fetchMock.mockResolvedValue(mockResponse({ sub: 'a/b', email: 'x@y.z' }));
    await getUser('a/b c');
    expect(lastUrl()).toBe('/users/a%2Fb%20c');
  });

  it('updateUser PUTs the encoded sub with a JSON body', async () => {
    fetchMock.mockResolvedValue(mockResponse({ sub: 'u1', email: 'x@y.z' }));
    await updateUser('u 1', { name: 'New', bio: 'Hi' });
    expect(lastUrl()).toBe('/users/u%201');
    const init = lastInit();
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ name: 'New', bio: 'Hi' }));
  });

  it('stripeOnboard POSTs and returns the redirect url', async () => {
    fetchMock.mockResolvedValue(mockResponse({ url: 'https://connect.stripe.com/x' }));
    const result = await stripeOnboard();
    expect(result).toEqual({ url: 'https://connect.stripe.com/x' });
    expect(lastUrl()).toBe('/users/me/stripe/onboard');
    expect(lastInit().method).toBe('POST');
  });

  it('stripeStatus GETs the account status', async () => {
    fetchMock.mockResolvedValue(mockResponse({ configured: true, detailsSubmitted: false }));
    const result = await stripeStatus();
    expect(result).toEqual({ configured: true, detailsSubmitted: false });
    expect(lastUrl()).toBe('/users/me/stripe/status');
  });
});
