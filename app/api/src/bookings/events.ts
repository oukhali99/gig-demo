import { createEventEnvelope } from '../lib/index.js';
import type { Booking } from './types.js';
import { broadcastEvent } from '../broadcast.js';

const PRODUCER = 'gig-demo';
const EVENT_VERSION = '1.0';

export async function publishBookingCreated(booking: Booking, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'booking.created',
    {
      bookingId: booking.bookingId,
      jobId: booking.jobId,
      workerId: booking.workerId,
      clientId: booking.clientId,
      status: booking.status,
    },
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishBookingConfirmed(booking: Booking, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'booking.confirmed',
    {
      bookingId: booking.bookingId,
      jobId: booking.jobId,
      workerId: booking.workerId,
      clientId: booking.clientId,
      scheduledAt: booking.updatedAt,
    },
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishBookingInProgress(booking: Booking, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'booking.in_progress',
    {
      bookingId: booking.bookingId,
      jobId: booking.jobId,
      workerId: booking.workerId,
      clientId: booking.clientId,
      startedAt: booking.updatedAt,
    },
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishBookingCompleted(booking: Booking, correlationId: string): Promise<void> {
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'booking.completed',
    {
      bookingId: booking.bookingId,
      jobId: booking.jobId,
      workerId: booking.workerId,
      clientId: booking.clientId,
      completedAt: booking.updatedAt,
    },
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishBookingCancelled(
  bookingId: string,
  jobId: string,
  correlationId: string,
  reason?: string,
  clientId?: string,
  workerId?: string
): Promise<void> {
  const payload: Record<string, unknown> = { bookingId, jobId };
  if (reason !== undefined) payload.reason = reason;
  if (clientId !== undefined) payload.clientId = clientId;
  if (workerId !== undefined) payload.workerId = workerId;
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'booking.cancelled', payload, correlationId);
  await broadcastEvent(detail);
}
