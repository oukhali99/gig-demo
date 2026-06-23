import { describe, expect, it } from 'vitest';
import {
  createJob,
  deleteJob,
  getJob,
  getJobImageUploadUrl,
  getJobImageUrls,
  listJobs,
  listMyDrafts,
  publishJob,
  setAuthToken,
  uploadToPresignedUrl,
} from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('jobs: listing', () => {
  it('listJobs includes only the params that are set', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listJobs({ status: 'published', clientId: 'me', limit: 10, cursor: 'c1' });
    expect(lastUrl()).toBe('/jobs?status=published&clientId=me&limit=10&cursor=c1');
  });

  it('listJobs with no params hits the bare path', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listJobs();
    expect(lastUrl()).toBe('/jobs');
  });

  it('listMyDrafts delegates to listJobs with clientId=me, status=draft and default limit 50', async () => {
    fetchMock.mockResolvedValue(mockResponse({ items: [] }));
    await listMyDrafts();
    expect(lastUrl()).toBe('/jobs?status=draft&clientId=me&limit=50');
  });

  it('getJob fetches a single job by id', async () => {
    fetchMock.mockResolvedValue(mockResponse({ jobId: 'j1' }));
    await getJob('j1');
    expect(lastUrl()).toBe('/jobs/j1');
  });
});

describe('jobs: mutations', () => {
  it('createJob POSTs the body', async () => {
    fetchMock.mockResolvedValue(mockResponse({ jobId: 'j1' }));
    const body = { title: 'T', categoryId: 'c', location: 'L', description: 'D', budget: 100, scheduledAt: '2026-07-01' };
    await createJob(body);
    expect(lastUrl()).toBe('/jobs');
    const init = lastInit();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(body));
  });

  it('publishJob POSTs to the publish path', async () => {
    fetchMock.mockResolvedValue(mockResponse({ jobId: 'j1', status: 'published' }));
    await publishJob('j1');
    expect(lastUrl()).toBe('/jobs/j1/publish');
    expect(lastInit().method).toBe('POST');
  });
});

describe('jobs: images', () => {
  it('getJobImageUploadUrl POSTs the content type', async () => {
    fetchMock.mockResolvedValue(mockResponse({ uploadUrl: 'https://s3/u', imageKey: 'k', expiresIn: 300, job: {} }));
    await getJobImageUploadUrl('j1', 'image/png');
    expect(lastUrl()).toBe('/jobs/j1/images/upload-url');
    expect(lastInit().body).toBe(JSON.stringify({ contentType: 'image/png' }));
  });

  it('getJobImageUploadUrl defaults the content type to image/jpeg', async () => {
    fetchMock.mockResolvedValue(mockResponse({ uploadUrl: 'https://s3/u', imageKey: 'k', expiresIn: 300, job: {} }));
    await getJobImageUploadUrl('j1');
    expect(lastInit().body).toBe(JSON.stringify({ contentType: 'image/jpeg' }));
  });

  it('getJobImageUrls short-circuits to {} without calling fetch when keys is empty', async () => {
    const result = await getJobImageUrls('j1', []);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getJobImageUrls joins keys into the query and returns the urls map', async () => {
    fetchMock.mockResolvedValue(mockResponse({ urls: { k1: 'https://s3/k1', k2: null } }));
    const result = await getJobImageUrls('j1', ['k1', 'k2']);
    expect(lastUrl()).toBe('/jobs/j1/images/urls?keys=k1%2Ck2');
    expect(result).toEqual({ k1: 'https://s3/k1', k2: null });
  });

  it('getJobImageUrls returns {} when the response has no urls field', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    expect(await getJobImageUrls('j1', ['k1'])).toEqual({});
  });

  it('uploadToPresignedUrl PUTs the file with its content type', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 200 }));
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    await uploadToPresignedUrl('https://s3/upload', file);
    expect(lastUrl()).toBe('https://s3/upload');
    const init = lastInit();
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('uploadToPresignedUrl defaults the content type when the file lacks one', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 200 }));
    const file = new File(['data'], 'photo');
    await uploadToPresignedUrl('https://s3/upload', file);
    expect((lastInit().headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
  });

  it('uploadToPresignedUrl throws when the upload fails', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 403, statusText: 'Forbidden' }));
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    await expect(uploadToPresignedUrl('https://s3/upload', file)).rejects.toThrow('Forbidden');
  });
});

describe('jobs: delete (bespoke fetch path)', () => {
  it('resolves on a 204 No Content', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));
    await expect(deleteJob('j1')).resolves.toBeUndefined();
    expect(lastUrl()).toBe('/jobs/j1');
    expect(lastInit().method).toBe('DELETE');
  });

  it('attaches the Authorization header when authenticated', async () => {
    setAuthToken('jwt');
    fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));
    await deleteJob('j1');
    expect((lastInit().headers as Record<string, string>).Authorization).toBe('Bearer jwt');
  });

  it('throws with the server message on failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: 'cannot delete' }, { status: 409 }));
    await expect(deleteJob('j1')).rejects.toThrow('cannot delete');
  });
});
