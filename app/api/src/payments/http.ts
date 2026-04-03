import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  devLog,
  json,
  badRequest,
  notFound,
  getCorrelationId,
  getIdempotencyKey,
  getSubFromEvent,
  parseBody,
} from '../lib/index.js';
import * as repo from './repository.js';
import * as events from './events.js';
import * as bookingsRepo from '../bookings/repository.js';
import type { CreateHoldInput, PaymentStatus } from './types.js';

const DEFAULT_CURRENCY = 'USD';

function getPaymentIdFromPath(event: APIGatewayProxyEventV2): string | null {
  const path = event.rawPath ?? '';
  const match = /^\/payments\/([^/]+)/.exec(path);
  return match ? match[1] : event.pathParameters?.id ?? null;
}

function validateCreateHold(body: unknown): { ok: true; data: CreateHoldInput } | { ok: false; errors: { field: string; message: string }[] } {
  const o = body as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!o || typeof o !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'JSON body required' }] };
  }
  if (typeof o.bookingId !== 'string' || !o.bookingId.trim()) {
    errors.push({ field: 'bookingId', message: 'required non-empty string' });
  }
  if (typeof o.amount !== 'string' || !o.amount.trim()) {
    errors.push({ field: 'amount', message: 'required non-empty string' });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      bookingId: (o.bookingId as string).trim(),
      amount: (o.amount as string).trim(),
      currency: typeof o.currency === 'string' && o.currency.trim() ? (o.currency as string).trim() : DEFAULT_CURRENCY,
    },
  };
}

async function handleCreateHold(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const idempotencyKey = getIdempotencyKey(event);
  if (!idempotencyKey) {
    return json(400, { errors: [{ field: 'Idempotency-Key', message: 'Header required for POST /payments/hold' }] });
  }

  const existing = await repo.getPaymentByIdempotencyKey(idempotencyKey);
  if (existing) return json(200, existing);

  const body = parseBody<unknown>(event);
  const validated = validateCreateHold(body);
  if (!validated.ok) return badRequest(validated.errors);

  const existingByBooking = await repo.getPaymentByBookingId(validated.data.bookingId);
  if (existingByBooking && existingByBooking.status === 'hold_created') {
    return json(409, { code: 'CONFLICT', message: 'A hold already exists for this booking' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });

  const booking = await bookingsRepo.getBooking(validated.data.bookingId);
  if (!booking) return notFound('Booking not found');
  if (booking.clientId !== sub && booking.workerId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Not a party to this booking' });
  }
  if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
    return json(409, { code: 'CONFLICT', message: 'Hold requires a confirmed or in-progress booking' });
  }

  const now = new Date().toISOString();
  const paymentId = randomUUID();
  const payment = {
    paymentId,
    bookingId: validated.data.bookingId,
    amount: validated.data.amount,
    currency: validated.data.currency ?? DEFAULT_CURRENCY,
    status: 'hold_created' as PaymentStatus,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
    clientId: booking.clientId,
    workerId: booking.workerId,
  };

  try {
    await repo.createPayment(payment);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      const again = await repo.getPaymentByIdempotencyKey(idempotencyKey);
      if (again) return json(200, again);
      return json(409, { code: 'CONFLICT', message: 'Payment already exists' });
    }
    throw e;
  }

  const correlationId = getCorrelationId(event);
  await events.publishHoldCreated(payment, correlationId);
  return json(201, payment);
}

function canAccessPayment(sub: string, payment: { clientId?: string; workerId?: string }): boolean {
  if (payment.clientId && payment.workerId) {
    return sub === payment.clientId || sub === payment.workerId;
  }
  return false;
}

async function handleListPayments(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });

  const raw = event.queryStringParameters?.limit;
  const parsed = raw ? parseInt(raw, 10) : 50;
  const limit = Number.isFinite(parsed) ? parsed : 50;

  const items = await repo.listPaymentsForParty(sub, limit);
  return json(200, { items });
}

async function handleGetPayment(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const paymentId = getPaymentIdFromPath(event);
  if (!paymentId) return json(400, { errors: [{ field: 'id', message: 'Payment ID required' }] });

  const payment = await repo.getPayment(paymentId);
  if (!payment) return notFound('Payment not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (!canAccessPayment(sub, payment)) {
    return json(403, { code: 'FORBIDDEN', message: 'Not a party to this payment' });
  }
  return json(200, payment);
}

async function handleRelease(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const paymentId = getPaymentIdFromPath(event);
  if (!paymentId) return json(400, { errors: [{ field: 'id', message: 'Payment ID required' }] });

  const payment = await repo.getPayment(paymentId);
  if (!payment) return notFound('Payment not found');
  if (payment.status !== 'hold_created') {
    return json(409, { code: 'CONFLICT', message: 'Payment is not in hold_created status' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (payment.clientId && sub !== payment.clientId) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the client (job poster) may release payment' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(paymentId, 'released', updatedAt);
  if (!updated) return notFound('Payment not found');

  const correlationId = getCorrelationId(event);
  await events.publishPaymentCompleted(updated, correlationId);
  return json(200, updated);
}

async function handleRefund(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const paymentId = getPaymentIdFromPath(event);
  if (!paymentId) return json(400, { errors: [{ field: 'id', message: 'Payment ID required' }] });

  const payment = await repo.getPayment(paymentId);
  if (!payment) return notFound('Payment not found');
  if (payment.status !== 'hold_created' && payment.status !== 'released') {
    return json(409, { code: 'CONFLICT', message: 'Payment cannot be refunded in current status' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (payment.clientId && payment.workerId && sub !== payment.clientId && sub !== payment.workerId) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the client or worker may refund' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updatePaymentStatus(paymentId, 'refunded', updatedAt);
  if (!updated) return notFound('Payment not found');

  const body = parseBody<{ reason?: string }>(event);
  const reason = body?.reason;
  const correlationId = getCorrelationId(event);
  await events.publishPaymentRefunded(updated, correlationId, reason);
  return json(200, updated);
}

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export async function handlePayments(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  let handlerFn: RouteHandler | undefined;
  if (method === 'POST' && path === '/payments/hold') handlerFn = handleCreateHold;
  else if (method === 'GET' && path === '/payments') handlerFn = handleListPayments;
  else if (method === 'GET' && path.startsWith('/payments/')) {
    const suffix = path.slice('/payments/'.length);
    if (suffix && !suffix.includes('/')) handlerFn = handleGetPayment;
  } else if (method === 'POST' && path.startsWith('/payments/')) {
    const suffix = path.slice('/payments/'.length);
    if (suffix.endsWith('/release')) handlerFn = handleRelease;
    else if (suffix.endsWith('/refund')) handlerFn = handleRefund;
  }

  if (handlerFn) {
    try {
      const response = await handlerFn(event);
      devLog('payments response', { method, path, statusCode: (response as { statusCode?: number }).statusCode });
      return response;
    } catch (err) {
      console.error('Payments handler error', err);
      devLog('payments handler error', { method, path, error: String(err) });
      return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
