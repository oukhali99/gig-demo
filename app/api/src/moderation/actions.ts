import { json, notFound, badRequest } from '../lib/api-helpers.js';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import * as bookingsRepo from '../bookings/repository.js';
import * as jobsRepo from '../jobs/repository.js';
import * as images from '../shared/images.js';

function isModeratedImageKey(key: string): boolean {
  return key.startsWith('jobs/') || key.startsWith('bookings/');
}

/** Approve a single image in manual review; returns HTTP result. */
export async function executeApproveKey(key: string): Promise<APIGatewayProxyResultV2> {
  const trimmed = key.trim();
  if (!trimmed || !isModeratedImageKey(trimmed)) {
    return badRequest([{ field: 'key', message: 'Valid jobs/ or bookings/ object key required' }]);
  }
  const exists = await images.objectExists(trimmed);
  if (!exists) return notFound('Object not found');
  const state = await images.getObjectModerationState(trimmed);
  if (state !== 'pending_review') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Image is not awaiting manual review',
      moderationState: state,
    });
  }
  await images.setObjectModerationTag(trimmed, 'approved');
  return json(200, { key: trimmed, moderation: 'approved' });
}

/** Reject (delete) a single image in manual review; returns HTTP result. */
export async function executeRejectKey(key: string): Promise<APIGatewayProxyResultV2> {
  const trimmed = key.trim();
  if (!trimmed || !isModeratedImageKey(trimmed)) {
    return badRequest([{ field: 'key', message: 'Valid jobs/ or bookings/ object key required' }]);
  }
  const exists = await images.objectExists(trimmed);
  if (!exists) return notFound('Object not found');
  const state = await images.getObjectModerationState(trimmed);
  if (state !== 'pending_review') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Image is not awaiting manual review',
      moderationState: state,
    });
  }
  const updatedAt = new Date().toISOString();
  if (trimmed.startsWith('jobs/')) {
    const jobId = trimmed.split('/')[1];
    if (jobId) await jobsRepo.removeJobImageKey(jobId, trimmed, updatedAt);
  } else {
    const bookingId = trimmed.split('/')[1];
    if (bookingId) await bookingsRepo.removeBookingImageKey(bookingId, trimmed, updatedAt);
  }
  await images.deleteObject(trimmed);
  return json(200, { key: trimmed, removed: true });
}
