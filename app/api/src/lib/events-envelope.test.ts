import { describe, expect, it } from 'vitest';
import { createEventEnvelope } from './events-envelope.js';

describe('createEventEnvelope', () => {
  it('assembles the envelope with the provided fields and payload', () => {
    const payload = { jobId: 'j1', clientId: 'c1' };
    const env = createEventEnvelope('jobs-service', '1.0', 'JobCreated', payload, 'corr-1');
    expect(env).toMatchObject({
      producer: 'jobs-service',
      eventVersion: '1.0',
      eventType: 'JobCreated',
      correlationId: 'corr-1',
      payload,
    });
  });

  it('generates a uuid eventId and an ISO-8601 timestamp', () => {
    const env = createEventEnvelope('p', '1', 'T', {}, 'c');
    expect(env.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(env.timestamp).toISOString()).toBe(env.timestamp);
  });

  it('gives each envelope a distinct eventId', () => {
    const a = createEventEnvelope('p', '1', 'T', {}, 'c');
    const b = createEventEnvelope('p', '1', 'T', {}, 'c');
    expect(a.eventId).not.toBe(b.eventId);
  });
});
