import { randomUUID } from 'crypto';
import * as repo from './repository.js';
import * as events from './events.js';
import type { PaymentStatus } from './types.js';
import type { Booking } from '../bookings/types.js';

const DEFAULT_CURRENCY = 'USD';
const DEFAULT_HOLD_AMOUNT = '0';

/** Synchronous counterpart to EventBridge booking.confirmed → create hold. */
export async function onBookingConfirmed(booking: Booking, correlationId: string): Promise<void> {
  const bookingId = booking.bookingId;
  const existing = await repo.getPaymentByBookingId(bookingId);
  if (existing && existing.status === 'hold_created') return;

  const now = new Date().toISOString();
  const paymentId = randomUUID();
  const payment = {
    paymentId,
    bookingId,
    amount: DEFAULT_HOLD_AMOUNT,
    currency: DEFAULT_CURRENCY,
    status: 'hold_created' as PaymentStatus,
    createdAt: now,
    updatedAt: now,
    clientId: booking.clientId,
    workerId: booking.workerId,
  };

  try {
    await repo.createPayment(payment);
    await events.publishHoldCreated(payment, correlationId);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') return;
    throw e;
  }
}

export async function onBookingCompleted(bookingId: string, correlationId: string): Promise<void> {
  const payment = await repo.getPaymentByBookingId(bookingId);
  if (!payment || payment.status !== 'hold_created') return;

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(payment.paymentId, 'released', updatedAt);
  if (updated) {
    await events.publishPaymentCompleted(updated, correlationId);
  }
}

export async function onBookingCancelled(
  bookingId: string,
  correlationId: string,
  reason?: string
): Promise<void> {
  const payment = await repo.getPaymentByBookingId(bookingId);
  if (!payment || (payment.status !== 'hold_created' && payment.status !== 'released')) return;

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(payment.paymentId, 'refunded', updatedAt);
  if (updated) {
    await events.publishPaymentRefunded(updated, correlationId, reason);
  }
}
