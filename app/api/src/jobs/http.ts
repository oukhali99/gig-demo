import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { devLog, json, badRequest, notFound, getCorrelationId, getSubFromEvent, parseBody } from '../lib/index.js';
import * as repo from './repository.js';
import * as events from './events.js';
import * as images from '../shared/images.js';
import * as textMod from '../shared/text-moderation.js';
import type { CreateJobInput, UpdateJobInput, JobStatus } from './types.js';

function getJobIdFromPath(event: APIGatewayProxyEventV2): string | null {
  const raw = event.pathParameters?.id ?? event.pathParameters?.jobId;
  if (raw) return raw;
  const path = event.rawPath ?? '';
  const match = /^\/jobs\/([^/]+)/.exec(path);
  return match ? match[1] : null;
}

function validateCreate(body: unknown): { ok: true; data: CreateJobInput } | { ok: false; errors: { field: string; message: string }[] } {
  const o = body as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  if (!o || typeof o !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'JSON body required' }] };
  }
  if (typeof o.title !== 'string' || !o.title.trim()) errors.push({ field: 'title', message: 'required non-empty string' });
  if (typeof o.categoryId !== 'string' || !o.categoryId.trim()) errors.push({ field: 'categoryId', message: 'required non-empty string' });
  if (typeof o.location !== 'string' || !o.location.trim()) errors.push({ field: 'location', message: 'required non-empty string' });
  if (typeof o.description !== 'string') errors.push({ field: 'description', message: 'required string' });
  if (typeof o.budget !== 'string' || !o.budget.trim()) errors.push({ field: 'budget', message: 'required non-empty string' });
  if (typeof o.scheduledAt !== 'string' || !o.scheduledAt.trim()) errors.push({ field: 'scheduledAt', message: 'required non-empty string' });
  if (errors.length) return { ok: false, errors };
  const clientId: string = typeof o.clientId === 'string' && o.clientId.trim() ? o.clientId.trim() : 'anonymous';
  return {
    ok: true,
    data: {
      title: (o.title as string).trim(),
      categoryId: (o.categoryId as string).trim(),
      location: (o.location as string).trim(),
      description: (o.description as string).trim(),
      budget: (o.budget as string).trim(),
      scheduledAt: (o.scheduledAt as string).trim(),
      clientId,
    },
  };
}

async function handleCreateJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<unknown>(event);
  const validated = validateCreate(body);
  if (!validated.ok) return badRequest(validated.errors);

  const now = new Date().toISOString();
  const jobId = randomUUID();

  const sub = getSubFromEvent(event);
  if (!sub) {
    return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const job = {
    jobId,
    clientId: sub,
    title: validated.data.title,
    categoryId: validated.data.categoryId,
    location: validated.data.location,
    description: validated.data.description,
    budget: validated.data.budget,
    scheduledAt: validated.data.scheduledAt,
    status: 'draft' as JobStatus,
    createdAt: now,
    updatedAt: now,
  };

  const textCheck = await textMod.moderateJobContent({
    title: job.title,
    description: job.description,
    location: job.location,
  });
  if (!textCheck.allowed) {
    return json(400, { code: 'MODERATION_REJECTED', message: textCheck.reason ?? 'Job text not allowed' });
  }

  try {
    await repo.createJob(job);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      return json(409, { code: 'CONFLICT', message: 'Job already exists' });
    }
    throw e;
  }

  const correlationId = getCorrelationId(event);
  await events.publishJobCreated(job, correlationId);

  return json(201, job);
}

async function handleUpdateJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const body = parseBody<UpdateJobInput>(event);
  if (!body || typeof body !== 'object') return badRequest([{ field: 'body', message: 'JSON body required' }]);

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');

  if (existing.status !== 'draft' && existing.status !== 'published') {
    return json(409, { code: 'CONFLICT', message: 'Cannot update closed job' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) {
    return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  if (existing.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'You are not the owner of this job' });
  }

  const modFields: textMod.TextFieldToModerate[] = [];
  if (typeof body.title === 'string') modFields.push({ field: 'title', text: body.title });
  if (typeof body.description === 'string') modFields.push({ field: 'description', text: body.description });
  if (typeof body.location === 'string') modFields.push({ field: 'location', text: body.location });
  if (modFields.length > 0) {
    const textCheck = await textMod.moderateTextFields(modFields);
    if (!textCheck.allowed) {
      return json(400, { code: 'MODERATION_REJECTED', message: textCheck.reason ?? 'Job text not allowed' });
    }
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateJob(jobId, {
    title: body.title,
    categoryId: body.categoryId,
    location: body.location,
    description: body.description,
    budget: body.budget,
    scheduledAt: body.scheduledAt,
  }, updatedAt);
  if (!updated) return notFound('Job not found');
  return json(200, updated);
}

async function handleImageUploadUrl(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (existing.clientId !== sub) return json(403, { code: 'FORBIDDEN', message: 'Not the job owner' });

  const body = parseBody<{ contentType?: string }>(event);
  const contentType = (body?.contentType && /^image\/(jpeg|jpg|png|gif|webp)$/i.test(body.contentType))
    ? body.contentType
    : 'image/jpeg';
  const ext = contentType === 'image/jpeg' || contentType === 'image/jpg' ? 'jpg' : contentType.split('/')[1] ?? 'jpg';
  const imageKey = `jobs/${jobId}/${randomUUID()}.${ext}`;
  const uploadUrl = await images.getPresignedPutUrl(imageKey, contentType);
  return json(200, { uploadUrl, imageKey, expiresIn: 300 });
}

async function handleAttachImage(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (existing.clientId !== sub) return json(403, { code: 'FORBIDDEN', message: 'Not the job owner' });

  const body = parseBody<{ imageKey?: string }>(event);
  const imageKey = typeof body?.imageKey === 'string' ? body.imageKey.trim() : '';
  if (!imageKey) return badRequest([{ field: 'imageKey', message: 'required non-empty string' }]);
  const prefix = `jobs/${jobId}/`;
  if (!imageKey.startsWith(prefix)) {
    return json(400, { errors: [{ field: 'imageKey', message: 'Key must be for this job (jobs/{jobId}/...)' }] });
  }

  const exists = await images.objectExists(imageKey);
  if (!exists) return json(400, { errors: [{ field: 'imageKey', message: 'Upload not found. Upload the file first using the upload URL.' }] });

  const moderation = await images.moderateImage(imageKey);
  if (!moderation.allowed) {
    await images.deleteObject(imageKey);
    return json(400, { code: 'MODERATION_REJECTED', message: moderation.reason ?? 'Image not allowed' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.addJobImageKey(jobId, imageKey, updatedAt);
  if (!updated) return notFound('Job not found');
  return json(200, updated);
}

async function handleImageUrls(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const job = await repo.getJob(jobId);
  if (!job) return notFound('Job not found');
  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (job.status !== 'published' && job.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'Job not visible' });
  }

  const keysParam = event.queryStringParameters?.keys ?? '';
  const requestedKeys = keysParam ? keysParam.split(',').map((k) => k.trim()).filter(Boolean) : [];
  const allowedKeys = (job.imageKeys ?? []).filter((k) => requestedKeys.includes(k));
  if (allowedKeys.length === 0) {
    return json(200, { urls: {} });
  }
  const urls: Record<string, string> = {};
  await Promise.all(
    allowedKeys.map(async (key) => {
      urls[key] = await images.getPresignedGetUrl(key);
    })
  );
  return json(200, { urls });
}

async function handleGetJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const job = await repo.getJob(jobId);
  if (!job) return notFound('Job not found');
  return json(200, job);
}

async function handleListJobs(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const q = event.queryStringParameters ?? {};
  const limit = q.limit ? parseInt(q.limit, 10) : undefined;
  const status = (q.status as JobStatus | undefined) ?? 'published';
  const category = q.category;
  const location = q.location;
  const cursor = q.cursor;
  const clientIdParam = q.clientId;

  if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
    return badRequest([{ field: 'limit', message: 'Must be 1–100' }]);
  }

  if (clientIdParam === 'me') {
    const sub = getSubFromEvent(event);
    if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
    const result = await repo.listJobsByClient(sub, limit ?? 20, cursor);
    let items = result.items;
    if (status) items = items.filter((j) => j.status === status);
    if (category) items = items.filter((j) => j.categoryId === category);
    if (location) {
      const loc = location.toLowerCase();
      items = items.filter((j) => j.location.toLowerCase().includes(loc));
    }
    return json(200, { items, nextCursor: result.nextCursor });
  }

  const result = await repo.listJobs({
    status: status as JobStatus,
    category,
    location,
    limit: limit ?? 20,
    cursor,
  });
  return json(200, { items: result.items, nextCursor: result.nextCursor });
}

async function handlePublishJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');
  if (existing.status !== 'draft') {
    return json(409, { code: 'CONFLICT', message: 'Job is not in draft status' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (existing.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'You are not the owner of this job' });
  }

  const textCheck = await textMod.moderateJobContent({
    title: existing.title,
    description: existing.description,
    location: existing.location,
  });
  if (!textCheck.allowed) {
    return json(400, { code: 'MODERATION_REJECTED', message: textCheck.reason ?? 'Job text not allowed' });
  }

  const updatedAt = new Date().toISOString();
  const updated = await repo.updateJobStatus(jobId, 'published', updatedAt);
  if (!updated) return notFound('Job not found');

  const correlationId = getCorrelationId(event);
  await events.publishJobPublished(updated, correlationId);

  return json(200, updated);
}

async function handleDeleteJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const sub = getSubFromEvent(event);
  if (!sub) {
    return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');
  if (existing.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'You are not the owner of this job' });
  }
  if (existing.status !== 'draft') {
    return json(409, {
      code: 'CONFLICT',
      message: 'Only draft jobs can be deleted. Close a published job instead.',
    });
  }

  try {
    await repo.deleteJob(jobId, sub);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      return json(409, {
        code: 'CONFLICT',
        message: 'Job cannot be deleted. It may have been published or removed.',
      });
    }
    throw e;
  }

  const correlationId = getCorrelationId(event);
  await events.publishJobDeleted(jobId, sub, correlationId);

  for (const key of existing.imageKeys ?? []) {
    try {
      await images.deleteObject(key);
    } catch {
      console.error('Failed to delete job image from S3', key);
    }
  }

  return {
    statusCode: 204,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '',
  };
}

async function handleCloseJob(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = getJobIdFromPath(event);
  if (!jobId) return json(400, { errors: [{ field: 'id', message: 'Job ID required' }] });

  const existing = await repo.getJob(jobId);
  if (!existing) return notFound('Job not found');
  if (existing.status !== 'draft' && existing.status !== 'published') {
    return json(409, { code: 'CONFLICT', message: 'Only draft or published jobs can be closed' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });
  if (existing.clientId !== sub) {
    return json(403, { code: 'FORBIDDEN', message: 'You are not the owner of this job' });
  }

  const body = parseBody<{ reason?: string }>(event);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;
  if (reason) {
    const reasonCheck = await textMod.moderateTextFields([{ field: 'reason', text: reason }]);
    if (!reasonCheck.allowed) {
      return json(400, { code: 'MODERATION_REJECTED', message: reasonCheck.reason ?? 'Close reason not allowed' });
    }
  }
  const updatedAt = new Date().toISOString();
  const updated = await repo.updateJobStatus(jobId, 'closed', updatedAt, reason);
  if (!updated) return notFound('Job not found');

  const correlationId = getCorrelationId(event);
  await events.publishJobClosed(jobId, existing.clientId, correlationId, reason);
  return json(200, updated);
}

type RouteHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export async function handleJobs(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  const routeKey = `${method} ${path}`;
  const routeMap: Record<string, RouteHandler> = {
    'POST /jobs': handleCreateJob,
    'PUT /jobs/{id}': handleUpdateJob,
    'GET /jobs/{id}': handleGetJob,
    'GET /jobs': handleListJobs,
    'POST /jobs/{id}/publish': handlePublishJob,
    'POST /jobs/{id}/close': handleCloseJob,
    'POST /jobs/{id}/images/upload-url': handleImageUploadUrl,
    'POST /jobs/{id}/images': handleAttachImage,
    'GET /jobs/{id}/images/urls': handleImageUrls,
    'DELETE /jobs/{id}': handleDeleteJob,
  };

  let handlerFn: RouteHandler | undefined = routeMap[routeKey];
  if (!handlerFn && method === 'GET' && path.startsWith('/jobs/')) {
    if (path.endsWith('/images/urls')) handlerFn = handleImageUrls;
    else handlerFn = routeMap['GET /jobs/{id}'];
  }
  if (!handlerFn && method === 'PUT' && path.startsWith('/jobs/')) {
    handlerFn = routeMap['PUT /jobs/{id}'];
  }
  if (!handlerFn && method === 'DELETE' && /^\/jobs\/[^/]+$/.test(path)) {
    handlerFn = handleDeleteJob;
  }
  if (!handlerFn && method === 'POST' && path.startsWith('/jobs/')) {
    if (path.endsWith('/images/upload-url')) handlerFn = handleImageUploadUrl;
    else if (path.match(/\/jobs\/[^/]+\/images$/) && !path.includes('upload-url')) handlerFn = handleAttachImage;
    else if (path.endsWith('/publish')) handlerFn = routeMap['POST /jobs/{id}/publish'];
    else if (path.endsWith('/close')) handlerFn = routeMap['POST /jobs/{id}/close'];
  }

  if (handlerFn) {
    try {
      const response = await handlerFn(event);
      devLog('jobs response', { method, path, statusCode: (response as { statusCode?: number }).statusCode });
      return response;
    } catch (err) {
      console.error('Handler error', err);
      devLog('jobs handler error', { method, path, error: String(err) });
      return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  }

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
