import { describe, expect, it } from 'vitest';
import { postAssistantChat } from './api';
import { fetchMock, lastInit, lastUrl, mockResponse, setupApiTest } from './api-test-utils';

setupApiTest();

describe('postAssistantChat', () => {
  it('returns the assistant message on success', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: { role: 'assistant', content: 'hi' } }));
    const res = await postAssistantChat({ purpose: 'job_draft', messages: [{ role: 'user', content: 'hello' }] });
    expect(res.message.content).toBe('hi');
    expect(lastUrl()).toBe('/assistant/chat');
  });

  it('includes the context field when provided', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: { role: 'assistant', content: 'hi' } }));
    await postAssistantChat({
      purpose: 'job_draft',
      messages: [{ role: 'user', content: 'x' }],
      context: { title: 'Plumbing' },
    });
    expect(lastInit().body).toBe(
      JSON.stringify({ purpose: 'job_draft', messages: [{ role: 'user', content: 'x' }], context: { title: 'Plumbing' } })
    );
  });

  it('omits the context field when not provided', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: { role: 'assistant', content: 'hi' } }));
    await postAssistantChat({ purpose: 'profile_bio', messages: [{ role: 'user', content: 'x' }] });
    expect(lastInit().body).toBe(
      JSON.stringify({ purpose: 'profile_bio', messages: [{ role: 'user', content: 'x' }] })
    );
  });

  it('prefers the top-level error message', async () => {
    fetchMock.mockResolvedValue(mockResponse({ message: 'too long' }, { status: 400 }));
    await expect(postAssistantChat({ purpose: 'job_draft', messages: [] })).rejects.toThrow('too long');
  });

  it('falls back to the first validation error message', async () => {
    fetchMock.mockResolvedValue(mockResponse({ errors: [{ message: 'messages required' }] }, { status: 400 }));
    await expect(postAssistantChat({ purpose: 'job_draft', messages: [] })).rejects.toThrow('messages required');
  });

  it('falls back to statusText when no message is present', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, { status: 500, statusText: 'Internal Error' }));
    await expect(postAssistantChat({ purpose: 'job_draft', messages: [] })).rejects.toThrow('Internal Error');
  });
});
