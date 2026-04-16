import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { logger, json, badRequest, notFound, getCorrelationId, getIdempotencyKey, getSubFromEvent, getClaims, parseBody } from '../lib/index.js';
import * as repo from './repository.js';
import * as events from './events.js';
import * as images from '../shared/images.js';
import * as jobsRepo from '../jobs/repository.js';
import * as cognitoModule from '../identity/cognito.js';
import * as paymentHooks from '../payments/booking-hooks.js';
import * as stripeClient from '../payments/stripe-client.js';
import type { CreateBookingInput, BookingStatus } from './types.js';

function getBookingIdFromPath(event: APIGatewayProxyEventV2): string | null {
  return event.pathParameters?.id ?? null;
}

function validateCreate(body: unknown): { ok: true; data: CreateBookingInput } | { ok: false; errors: { field: string; message: string }[] } {
  const o = body as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!o || typeof o !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'JSON body required' }] };
  }
  if (typeof o.jobId !== 'string' || !o.jobId.trim()) errors.push({ field: 'jobId', message: 'required non-empty string' });
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { jobId: (o.jobId as string).trim() } };
}

async function handleCreateBooking(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const idempotencyKey = getIdempotencyKey(event);
  if (!idempotencyKey) {
    return json(400, { errors: [{ field: 'Idempotency-Key', message: 'Header required for POST /bookings' }] });
  }

  const existing = await repo.getBookingByIdempotencyKey(idempotencyKey);
  if (existing) {
    return json(200, existing);
  }

  const body = parseBody<unknown>(event);
  const validated = validateCreate(body);
  if (!validated.ok) return badRequest(validated.errors);

  const job = await jobsRepo.getJob(validated.data.jobId);
  if (!job) return notFound('Job not found');
  if (job.status !== 'published') {
    return json(409, { code: 'CONFLICT', message: 'Job is not published' });
  }
  const clientId = job.clientId;
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (sub === clientId) {
    return json(400, { code: 'INVALID', message: 'Job owner cannot book their own job' });
  }

  if (stripeClient.isStripeConfigured()) {
    const claims = getClaims(event);
    if (!claims?.['custom:stripeAccountId']) {
      return json(403, { code: 'STRIPE_NOT_ONBOARDED', message: 'You must set up payouts before applying for jobs' });
    }
  }

  const now = new Date().toISOString();
  const bookingId = randomUUID();
  const booking = {
    bookingId,
    jobId: validated.data.jobId,
    workerId: sub,
    clientId,
    status: 'requested' as BookingStatus,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
  };

  try {
    await repo.createBooking(booking);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      const again = await repo.getBookingByIdempotencyKey(idempotencyKey);
      if (again) return json(200, again);
      return json(409, { code: 'CONFLICT', message: 'Booking already exists' });
    }
    throw e;
  }

  const correlationId = getCorrelationId(event);
  await events.publishBookingCreated(booking, correlationId);
  return json(201, booking);
}

async function handleGetBooking(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (booking.clientId !== sub && booking.workerId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Booking not found' });
  }

  return json(200, booking);
}

async function handleListBookings(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const q = event.queryStringParameters ?? {};
  const jobId = q.jobId;
  const workerId = q.workerId;
  const status = q.status as BookingStatus | undefined;
  const limit = q.limit ? parseInt(q.limit, 10) : undefined;
  const cursor = q.cursor;

  if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    return badRequest([{ field: 'limit', message: 'Must be 1–100' }]);
  }
  if (!jobId && !workerId && !status) {
    return badRequest([{ field: 'query', message: 'One of jobId, workerId, or status is required' }]);
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });

  const result = await repo.listBookings({
    jobId: jobId ?? undefined,
    workerId: workerId ?? undefined,
    status,
    limit: limit ?? 20,
    cursor,
  });
  const allowed = result.items.filter(
    (b) => b.clientId === sub || b.workerId === sub
  );
  return json(200, { items: allowed, nextCursor: result.nextCursor });
}

async function handleConfirm(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  if (booking.status !== 'requested') {
    return json(409, { code: 'CONFLICT', message: 'Booking is not in requested status' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (booking.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the job client may confirm' });
  }

  const body = parseBody<{ paymentMethodId?: string }>(event);
  const paymentMethodId = typeof body?.paymentMethodId === 'string' ? body.paymentMethodId.trim() : null;

  const job = await jobsRepo.getJob(booking.jobId);
  const budgetCents = typeof job?.budget === 'number' ? job.budget : 0;

  const correlationId = getCorrelationId(event);

  // Create payment hold (+ Stripe PaymentIntent) before confirming — rolls back cleanly on failure.
  const hookErr = await paymentHooks.onBookingConfirmed(booking, budgetCents, paymentMethodId, correlationId).catch((e: unknown) => e as Error);
  if (hookErr instanceof Error) {
    const err = hookErr as Error & { code?: string };
    return json(402, { code: err.code ?? 'PAYMENT_FAILED', message: err.message });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateBookingStatus(bookingId, 'confirmed', updatedAt);
  if (!updated) return notFound('Booking not found');

  await events.publishBookingConfirmed(updated, correlationId);
  return json(200, updated);
}

async function handleComplete(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
    return json(409, { code: 'CONFLICT', message: 'Booking must be confirmed or in progress to complete' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (booking.clientId !== sub && booking.workerId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the client or worker may complete' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateBookingStatus(bookingId, 'completed', updatedAt);
  if (!updated) return notFound('Booking not found');

  const correlationId = getCorrelationId(event);
  await events.publishBookingCompleted(updated, correlationId);
  const workerProfile = await cognitoModule.getUserBySub(booking.workerId).catch(() => null);
  await paymentHooks.onBookingCompleted(updated.bookingId, correlationId, workerProfile?.stripeAccountId);
  return json(200, updated);
}

async function handleCancel(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return json(409, { code: 'CONFLICT', message: 'Booking cannot be cancelled' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (booking.clientId !== sub && booking.workerId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the client or worker may cancel' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateBookingStatus(bookingId, 'cancelled', updatedAt);
  if (!updated) return notFound('Booking not found');

  const body = parseBody<{ reason?: string }>(event);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;
  const correlationId = getCorrelationId(event);
  await events.publishBookingCancelled(
    bookingId,
    booking.jobId,
    correlationId,
    reason,
    booking.clientId,
    booking.workerId
  );
  await paymentHooks.onBookingCancelled(bookingId, correlationId, reason);
  return json(200, updated);
}

async function handleStartInProgress(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  if (booking.status !== 'confirmed') {
    return json(409, { code: 'CONFLICT', message: 'Booking must be confirmed to start work' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (booking.workerId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Only the worker may mark work as started' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateBookingStatus(bookingId, 'in_progress', updatedAt);
  if (!updated) return notFound('Booking not found');

  const correlationId = getCorrelationId(event);
  await events.publishBookingInProgress(updated, correlationId);
  return json(200, updated);
}

function isBookingParticipant(booking: { clientId: string; workerId: string }, sub: string): boolean {
  return sub === booking.clientId || sub === booking.workerId;
}

async function handleBookingImageUploadUrl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (!isBookingParticipant(booking, sub)) return json(403, { code: 'FORBIDDEN', message: 'Not a party to this booking' });

  const body = parseBody<{ contentType?: string }>(event);
  const contentType = (body?.contentType && /^image\/(jpeg|jpg|png|gif|webp)$/i.test(body.contentType))
    ? body.contentType
    : 'image/jpeg';
  const ext = contentType === 'image/jpeg' || contentType === 'image/jpg' ? 'jpg' : contentType.split('/')[1] ?? 'jpg';
  const imageKey = `bookings/${bookingId}/${randomUUID()}.${ext}`;
  const uploadUrl = await images.getPresignedPutUrl(imageKey, contentType);
  const updatedAt = new Date().toISOString();
  const updated = await repo.addBookingImageKey(bookingId, imageKey, updatedAt);
  if (!updated) return notFound('Booking not found');
  return json(200, { uploadUrl, imageKey, expiresIn: 300, booking: updated });
}

async function handleBookingImageUrls(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const bookingId = getBookingIdFromPath(event);
  if (!bookingId) return json(400, { errors: [{ field: 'id', message: 'Booking ID required' }] });

  const booking = await repo.getBooking(bookingId);
  if (!booking) return notFound('Booking not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (!isBookingParticipant(booking, sub)) return json(403, { code: 'FORBIDDEN', message: 'Not a party to this booking' });

  const keysParam = event.queryStringParameters?.keys ?? '';
  const requestedKeys = keysParam ? keysParam.split(',').map((k) => k.trim()).filter(Boolean) : [];
  const allowedKeys = (booking.imageKeys ?? []).filter((k) => requestedKeys.includes(k));
  if (allowedKeys.length === 0) return json(200, { urls: {} });
  const urls: Record<string, string | null> = {};
  await Promise.all(
    allowedKeys.map(async (key) => {
      const exists = await images.objectExists(key);
      if (!exists) {
        urls[key] = null;
        return;
      }
      const moderationState = await images.getObjectModerationState(key);
      if (moderationState !== 'approved') {
        urls[key] = null;
        return;
      }
      urls[key] = await images.getPresignedGetUrl(key);
    })
  );
  return json(200, { urls });
}

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export async function handleBookings(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  const routeMap: Record<string, RouteHandler> = {
    'POST /bookings': handleCreateBooking,
    'GET /bookings/{id}': handleGetBooking,
    'GET /bookings': handleListBookings,
    'POST /bookings/{id}/confirm': handleConfirm,
    'POST /bookings/{id}/start': handleStartInProgress,
    'POST /bookings/{id}/complete': handleComplete,
    'POST /bookings/{id}/cancel': handleCancel,
    'POST /bookings/{id}/images/upload-url': handleBookingImageUploadUrl,
    'GET /bookings/{id}/images/urls': handleBookingImageUrls,
  };

  let handlerFn: RouteHandler | undefined;
  if (method === 'POST' && path === '/bookings') handlerFn = routeMap['POST /bookings'];
  else if (method === 'GET' && path === '/bookings') handlerFn = routeMap['GET /bookings'];
  else if (path.startsWith('/bookings/')) {
    const suffix = path.slice('/bookings/'.length);
    if (method === 'GET' && suffix.endsWith('/images/urls')) handlerFn = handleBookingImageUrls;
    else if (method === 'GET' && suffix && !suffix.includes('/')) handlerFn = routeMap['GET /bookings/{id}'];
    else if (method === 'POST' && suffix.endsWith('/images/upload-url')) handlerFn = handleBookingImageUploadUrl;
    else if (method === 'POST' && suffix.endsWith('/confirm')) handlerFn = routeMap['POST /bookings/{id}/confirm'];
    else if (method === 'POST' && suffix.endsWith('/start')) handlerFn = routeMap['POST /bookings/{id}/start'];
    else if (method === 'POST' && suffix.endsWith('/complete')) handlerFn = routeMap['POST /bookings/{id}/complete'];
    else if (method === 'POST' && suffix.endsWith('/cancel')) handlerFn = routeMap['POST /bookings/{id}/cancel'];
  }

  if (handlerFn) {
    try {
      const response = await handlerFn(event);
      logger.debug('bookings response', { method, path, statusCode: (response as { statusCode?: number }).statusCode });
      return response;
    } catch (err) {
      logger.error('bookings handler error', { method, path, error: String(err) });
      return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
