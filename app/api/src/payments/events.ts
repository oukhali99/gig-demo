import { createEventEnvelope } from '../lib/index.js';
import type { Payment } from './types.js';
import { broadcastEvent } from '../broadcast.js';

const PRODUCER = 'gig-demo';
const EVENT_VERSION = '1.0';

export async function publishHoldCreated(
  payment: Payment,
  correlationId: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    paymentId: payment.paymentId,
    bookingId: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
  };
  if (payment.clientId !== undefined) payload.clientId = payment.clientId;
  if (payment.workerId !== undefined) payload.workerId = payment.workerId;
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'payment.hold.created',
    payload,
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishPaymentCompleted(
  payment: Payment,
  correlationId: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    paymentId: payment.paymentId,
    bookingId: payment.bookingId,
    amount: payment.amount,
  };
  if (payment.clientId !== undefined) payload.clientId = payment.clientId;
  if (payment.workerId !== undefined) payload.workerId = payment.workerId;
  const detail = createEventEnvelope(
    PRODUCER,
    EVENT_VERSION,
    'payment.completed',
    payload,
    correlationId
  );
  await broadcastEvent(detail);
}

export async function publishPaymentRefunded(
  payment: Payment,
  correlationId: string,
  reason?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    paymentId: payment.paymentId,
    bookingId: payment.bookingId,
    amount: payment.amount,
  };
  if (payment.clientId !== undefined) payload.clientId = payment.clientId;
  if (payment.workerId !== undefined) payload.workerId = payment.workerId;
  if (reason !== undefined) payload.reason = reason;
  const detail = createEventEnvelope(PRODUCER, EVENT_VERSION, 'payment.refunded', payload, correlationId);
  await broadcastEvent(detail);
}
