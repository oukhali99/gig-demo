import { createEventEnvelope } from '../lib/index.js';
import type { Job } from './types.js';
import { broadcastEvent } from '../broadcast.js';

const PRODUCER = 'gig-demo';
const EVENT_VERSION = '1.0';

export async function publishJobCreated(job: Job, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'job.created', {
    jobId: job.jobId,
    clientId: job.clientId,
    categoryId: job.categoryId,
    location: job.location,
    status: job.status,
  }, correlationId);
  await broadcastEvent(detail);
}

export async function publishJobPublished(job: Job, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'job.published', {
    jobId: job.jobId,
    clientId: job.clientId,
  }, correlationId);
  await broadcastEvent(detail);
}

export async function publishJobClosed(
  jobId: string,
  clientId: string,
  correlationId: string,
  reason?: string
): Promise<void> {
  const payload: Record<string, unknown> = { jobId, clientId };
  if (reason !== undefined) payload.reason = reason;
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'job.closed', payload, correlationId);
  await broadcastEvent(detail);
}

export async function publishJobDeleted(jobId: string, clientId: string, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'job.deleted', { jobId, clientId }, correlationId);
  await broadcastEvent(detail);
}
