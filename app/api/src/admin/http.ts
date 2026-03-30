import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { json, badRequest, getClaims, notFound, parseBody } from '../lib/index.js';
import * as images from '../shared/images.js';
import * as actions from '../moderation/actions.js';

function isAdmin(claims: Record<string, unknown> | null): boolean {
  if (!claims) return false;
  const r = claims['custom:role'];
  return typeof r === 'string' && r.trim() === 'admin';
}

function forbidden(): APIGatewayProxyResultV2 {
  return json(403, { code: 'FORBIDDEN', message: 'Admin access required (custom:role=admin)' });
}

function parsePrefix(raw: string | undefined): 'jobs/' | 'bookings/' {
  const p = raw?.trim() ?? 'jobs';
  if (p === 'bookings' || p === 'bookings/') return 'bookings/';
  return 'jobs/';
}

async function handlePending(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAdmin(getClaims(event))) return forbidden();
  const qs = event.queryStringParameters ?? {};
  const prefix = parsePrefix(qs.prefix);
  const cursor = typeof qs.cursor === 'string' && qs.cursor.trim() ? qs.cursor.trim() : undefined;
  const { items, nextCursor } = await images.listPendingReviewPage(prefix, cursor, 40);
  return json(200, {
    items,
    nextCursor,
    prefix: prefix === 'jobs/' ? 'jobs' : 'bookings',
  });
}

async function handlePreviewUrl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAdmin(getClaims(event))) return forbidden();
  const raw = event.queryStringParameters?.key;
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key || (!key.startsWith('jobs/') && !key.startsWith('bookings/'))) {
    return badRequest([{ field: 'key', message: 'query key must be a jobs/ or bookings/ object key' }]);
  }
  const exists = await images.objectExists(key);
  if (!exists) return notFound('Object not found');
  const state = await images.getObjectModerationState(key);
  if (state !== 'pending_review') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Preview is only available for images awaiting manual review',
      moderationState: state,
    });
  }
  const url = await images.getPresignedS3GetObjectUrl(key);
  return json(200, { url, expiresIn: images.PRESIGN_GET_PREVIEW_EXPIRES_SEC });
}

async function handleApprove(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAdmin(getClaims(event))) return forbidden();
  const body = parseBody<{ key?: string }>(event);
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!key.trim()) return badRequest([{ field: 'key', message: 'required non-empty string' }]);
  return actions.executeApproveKey(key);
}

async function handleReject(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!isAdmin(getClaims(event))) return forbidden();
  const body = parseBody<{ key?: string }>(event);
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!key.trim()) return badRequest([{ field: 'key', message: 'required non-empty string' }]);
  return actions.executeRejectKey(key);
}

export async function handleAdmin(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  if (method === 'GET' && path === '/admin/moderation/pending') return handlePending(event);
  if (method === 'GET' && path === '/admin/moderation/preview-url') return handlePreviewUrl(event);
  if (method === 'POST' && path === '/admin/moderation/approve') return handleApprove(event);
  if (method === 'POST' && path === '/admin/moderation/reject') return handleReject(event);

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
