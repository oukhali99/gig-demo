import { randomUUID } from 'crypto';
import * as repo from './repository.js';
import * as events from './events.js';
import * as stripeClient from './stripe-client.js';
import type { PaymentStatus } from './types.js';
import type { Booking } from '../bookings/types.js';

const DEFAULT_CURRENCY = 'USD';

/**
 * Called before booking is confirmed — creates a Stripe PaymentIntent (hold) and a payment
 * record. If paymentMethodId is absent or Stripe is not configured, creates a $0 record only.
 */
export async function onBookingConfirmed(
  booking: Booking,
  budgetCents: number,
  paymentMethodId: string | null,
  correlationId: string
): Promise<void> {
  const bookingId = booking.bookingId;
  const existing = await repo.getPaymentByBookingId(bookingId);
  if (existing && existing.status === 'hold_created') return;

  let stripePaymentIntentId: string | undefined;

  if (paymentMethodId && budgetCents > 0 && stripeClient.isStripeConfigured()) {
    const pi = await stripeClient.createPaymentIntent({
      amountCents: budgetCents,
      currency: DEFAULT_CURRENCY,
      bookingId,
      paymentMethodId,
    });
    if (pi.status !== 'requires_capture') {
      throw Object.assign(
        new Error(`Payment requires additional action (${pi.status}). Please use a different card.`),
        { code: 'PAYMENT_REQUIRES_ACTION', stripeStatus: pi.status }
      );
    }
    stripePaymentIntentId = pi.id;
  }

  const now = new Date().toISOString();
  const paymentId = randomUUID();
  const payment = {
    paymentId,
    bookingId,
    amount: budgetCents,
    currency: DEFAULT_CURRENCY,
    status: 'hold_created' as PaymentStatus,
    createdAt: now,
    updatedAt: now,
    clientId: booking.clientId,
    workerId: booking.workerId,
    stripePaymentIntentId,
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

/** Called when booking is completed — captures the Stripe hold and marks payment released. */
export async function onBookingCompleted(bookingId: string, correlationId: string): Promise<void> {
  const payment = await repo.getPaymentByBookingId(bookingId);
  if (!payment || payment.status !== 'hold_created') return;

  if (payment.stripePaymentIntentId) {
    await stripeClient.capturePaymentIntent(payment.stripePaymentIntentId);
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(payment.paymentId, 'released', updatedAt);
  if (updated) {
    await events.publishPaymentCompleted(updated, correlationId);
  }
}

/** Called when booking is cancelled — cancels the Stripe hold and marks payment refunded. */
export async function onBookingCancelled(
  bookingId: string,
  correlationId: string,
  reason?: string
): Promise<void> {
  const payment = await repo.getPaymentByBookingId(bookingId);
  if (!payment || (payment.status !== 'hold_created' && payment.status !== 'released')) return;

  if (payment.stripePaymentIntentId && payment.status === 'hold_created') {
    await stripeClient.cancelPaymentIntent(payment.stripePaymentIntentId);
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(payment.paymentId, 'refunded', updatedAt);
  if (updated) {
    await events.publishPaymentRefunded(updated, correlationId, reason);
  }
}
