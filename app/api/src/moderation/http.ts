import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { timingSafeEqual } from 'crypto';
import { json, badRequest, notFound, parseBody } from '../lib/api-helpers.js';
import * as bookingsRepo from '../bookings/repository.js';
import * as jobsRepo from '../jobs/repository.js';
import * as images from '../shared/images.js';

function isModeratorRequest(event: APIGatewayProxyEventV2): boolean {
  const expected = process.env.IMAGE_MODERATION_ADMIN_API_KEY?.trim() ?? '';
  if (!expected) return false;
  const h = event.headers as Record<string, string | undefined>;
  const provided =
    h['x-image-moderation-admin-key'] ?? h['X-Image-Moderation-Admin-Key'] ?? '';
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

function forbidden(): APIGatewayProxyResultV2 {
  return json(403, { code: 'FORBIDDEN', message: 'Moderation admin key missing or invalid' });
}

function isModeratedImageKey(key: string): boolean {
  return key.startsWith('jobs/') || key.startsWith('bookings/');
}

async function handleApprove(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isModeratorRequest(event)) return forbidden();
  const body = parseBody<{ key?: string }>(event);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key || !isModeratedImageKey(key)) {
    return badRequest([{ field: 'key', message: 'Valid jobs/ or bookings/ object key required' }]);
  }
  const exists = await images.objectExists(key);
  if (!exists) return notFound('Object not found');
  const state = await images.getObjectModerationState(key);
  if (state !== 'pending_review') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Image is not awaiting manual review',
      moderationState: state,
    });
  }
  await images.setObjectModerationTag(key, 'approved');
  return json(200, { key, moderation: 'approved' });
}

async function handleReject(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isModeratorRequest(event)) return forbidden();
  const body = parseBody<{ key?: string }>(event);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key || !isModeratedImageKey(key)) {
    return badRequest([{ field: 'key', message: 'Valid jobs/ or bookings/ object key required' }]);
  }
  const exists = await images.objectExists(key);
  if (!exists) return notFound('Object not found');
  const state = await images.getObjectModerationState(key);
  if (state !== 'pending_review') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Image is not awaiting manual review',
      moderationState: state,
    });
  }
  const updatedAt = new Date().toISOString();
  if (key.startsWith('jobs/')) {
    const jobId = key.split('/')[1];
    if (jobId) await jobsRepo.removeJobImageKey(jobId, key, updatedAt);
  } else {
    const bookingId = key.split('/')[1];
    if (bookingId) await bookingsRepo.removeBookingImageKey(bookingId, key, updatedAt);
  }
  await images.deleteObject(key);
  return json(200, { key, removed: true });
}

export async function handleModeration(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  if (method === 'POST' && path === '/moderation/images/approve') return handleApprove(event);
  if (method === 'POST' && path === '/moderation/images/reject') return handleReject(event);

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
