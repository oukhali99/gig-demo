import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  devLog,
  json,
  badRequest,
  getSubFromEvent,
  parseBody,
} from '../lib/index.js';
import * as repo from './repository.js';
import * as bookingsRepo from '../bookings/repository.js';

function validateReviewBody(body: unknown): { ok: true; bookingId: string; rating: number; text: string } | { ok: false; errors: { field: string; message: string }[] } {
  const o = body as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!o || typeof o !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'JSON body required' }] };
  }
  const bookingId = typeof o.bookingId === 'string' ? o.bookingId.trim() : '';
  if (!bookingId) errors.push({ field: 'bookingId', message: 'required non-empty string' });
  const rating = typeof o.rating === 'number' ? o.rating : typeof o.rating === 'string' ? parseInt(o.rating, 10) : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push({ field: 'rating', message: 'must be integer 1–5' });
  }
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text) errors.push({ field: 'text', message: 'required non-empty string' });
  if (text.length > 2000) errors.push({ field: 'text', message: 'max 2000 characters' });
  if (errors.length) return { ok: false, errors };
  return { ok: true, bookingId, rating, text };
}

async function handlePostReview(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });

  const body = parseBody<unknown>(event);
  if (body === null) return badRequest([{ field: 'body', message: 'JSON body required' }]);
  const v = validateReviewBody(body);
  if (!v.ok) return badRequest(v.errors);

  const booking = await bookingsRepo.getBooking(v.bookingId);
  if (!booking?.bookingId) return json(404, { code: 'NOT_FOUND', message: 'Booking not found' });
  if (booking.status !== 'completed') {
    return json(409, { code: 'CONFLICT', message: 'Booking must be completed to review' });
  }
  const clientId = booking.clientId ?? '';
  const workerId = booking.workerId ?? '';
  if (sub !== clientId && sub !== workerId) {
    return json(403, { code: 'FORBIDDEN', message: 'Only booking parties may review' });
  }
  const revieweeId = sub === clientId ? workerId : clientId;
  if (!revieweeId) return json(400, { errors: [{ field: 'booking', message: 'Missing parties on booking' }] });

  const now = new Date().toISOString();
  const review = {
    reviewId: randomUUID(),
    bookingId: v.bookingId,
    reviewerId: sub,
    revieweeId,
    rating: v.rating,
    text: v.text,
    createdAt: now,
  };

  const result = await repo.createReview(review);
  if (!result.ok) {
    return json(409, { code: 'CONFLICT', message: 'You already reviewed this booking' });
  }
  return json(201, review);
}

async function handleListReviews(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const revieweeId = event.queryStringParameters?.revieweeId?.trim();
  if (!revieweeId) {
    return badRequest([{ field: 'revieweeId', message: 'query parameter required' }]);
  }
  const limitRaw = event.queryStringParameters?.limit;
  const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20)) : 20;
  const cursor = event.queryStringParameters?.cursor;

  const { items, nextCursor } = await repo.listByReviewee(revieweeId, limit, cursor);
  return json(200, { items, nextCursor });
}

export async function handleReviews(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  try {
    if (method === 'POST' && path === '/reviews') {
      return await handlePostReview(event);
    }
    if (method === 'GET' && path === '/reviews') {
      return await handleListReviews(event);
    }
    return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
  } catch (err) {
    console.error('reviews handler error', err);
    devLog('reviews error', { path, error: String(err) });
    return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
