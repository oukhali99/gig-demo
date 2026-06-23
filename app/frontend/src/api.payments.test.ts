import { describe, expect, it } from 'vitest';
import { listPayments } from './api';
import { fetchMock, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('payments', () => {
  it('listPayments hits the bare path with no params', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listPayments();
    expect(lastUrl()).toBe('/payments');
  });

  it('listPayments includes limit=0 (uses != null, not a falsy check)', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listPayments({ limit: 0 });
    expect(lastUrl()).toBe('/payments?limit=0');
  });

  it('listPayments serializes a positive limit', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listPayments({ limit: 25 });
    expect(lastUrl()).toBe('/payments?limit=25');
  });
});
