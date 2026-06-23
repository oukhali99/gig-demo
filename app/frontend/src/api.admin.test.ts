import { describe, expect, it } from 'vitest';
import {
  adminModerationApprove,
  adminModerationReject,
  getAdminModerationPending,
  getAdminModerationPreviewUrl,
} from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('admin moderation', () => {
  it('getAdminModerationPending hits the bare path with no params', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [], prefix: 'jobs' }));
    await getAdminModerationPending();
    expect(lastUrl()).toBe('/admin/moderation/pending');
  });

  it('getAdminModerationPending builds the optional prefix/cursor query', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [], prefix: 'jobs' }));
    await getAdminModerationPending({ prefix: 'jobs', cursor: 'next' });
    expect(lastUrl()).toBe('/admin/moderation/pending?prefix=jobs&cursor=next');
  });

  it('adminModerationApprove POSTs the key', async () => {
    fetchMock.mockResolvedValue(mockResponse({ key: 'k1', moderation: 'approved' }));
    await adminModerationApprove('k1');
    expect(lastUrl()).toBe('/admin/moderation/approve');
    expect(lastInit().body).toBe(JSON.stringify({ key: 'k1' }));
  });

  it('adminModerationReject POSTs the key', async () => {
    fetchMock.mockResolvedValue(mockResponse({ key: 'k1', removed: true }));
    await adminModerationReject('k1');
    expect(lastUrl()).toBe('/admin/moderation/reject');
    expect(lastInit().body).toBe(JSON.stringify({ key: 'k1' }));
  });

  it('getAdminModerationPreviewUrl encodes the key into the query', async () => {
    fetchMock.mockResolvedValue(mockResponse({ url: 'https://s3/x', expiresIn: 300 }));
    await getAdminModerationPreviewUrl('jobs/img 1.jpg');
    expect(lastUrl()).toBe('/admin/moderation/preview-url?key=jobs%2Fimg+1.jpg');
  });
});
