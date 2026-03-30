import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { devLog, json, parseBody, getClaims } from '../lib/index.js';
import * as cognito from './cognito.js';

async function handleRegister(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<{ email?: string; password?: string }>(event);
  if (!body?.email || !body?.password) {
    return json(400, { errors: [{ field: 'email', message: 'required' }, { field: 'password', message: 'required' }] });
  }
  try {
    const { sub } = await cognito.register(body.email, body.password);
    return json(201, { sub });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err.name === 'UsernameExistsException') {
      return json(409, { code: 'CONFLICT', message: 'Email already registered' });
    }
    throw e;
  }
}

async function handleLogin(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<{ email?: string; password?: string }>(event);
  if (!body?.email || !body?.password) {
    return json(400, { errors: [{ field: 'email', message: 'required' }, { field: 'password', message: 'required' }] });
  }
  try {
    const tokens = await cognito.login(body.email, body.password);
    return json(200, tokens);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'NotAuthorizedException' || err.name === 'UserNotFoundException') {
      return json(401, { code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    }
    throw e;
  }
}

async function handleRefresh(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<{ refreshToken?: string }>(event);
  if (!body?.refreshToken) {
    return json(400, { errors: [{ field: 'refreshToken', message: 'required' }] });
  }
  try {
    const tokens = await cognito.refresh(body.refreshToken);
    return json(200, tokens);
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'NotAuthorizedException') {
      return json(401, { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' });
    }
    throw e;
  }
}

async function handleMe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const claims = getClaims(event);
  if (!claims) {
    return json(401, { code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  }
  const sub = String(claims.sub ?? claims['cognito:username'] ?? '');
  const email = String(claims.email ?? claims['cognito:username'] ?? '');
  const rawRole = claims['custom:role'];
  const role = typeof rawRole === 'string' && rawRole.trim() ? rawRole.trim() : undefined;
  return json(200, { sub, email, ...(role ? { role } : {}) });
}

async function handleGetUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const claims = getClaims(event);
  if (!claims) return json(401, { code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  const id = event.pathParameters?.id;
  if (!id) return json(400, { errors: [{ field: 'id', message: 'User ID required' }] });
  const user = await cognito.getUserBySub(id);
  if (!user) return json(404, { code: 'NOT_FOUND', message: 'User not found' });
  return json(200, { sub: user.sub, email: user.email });
}

export async function handleIdentity(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';

  devLog('identity request', { method, path, requestId: event.requestContext?.requestId });

  try {
    let response: APIGatewayProxyResultV2;
    if (method === 'POST' && path === '/auth/register') response = await handleRegister(event);
    else if (method === 'POST' && path === '/auth/login') response = await handleLogin(event);
    else if (method === 'POST' && path === '/auth/refresh') response = await handleRefresh(event);
    else if (method === 'GET' && path === '/auth/me') response = await handleMe(event);
    else if (method === 'GET' && path.startsWith('/users/')) {
      const id = event.pathParameters?.id ?? (path.replace(/^\/users\/?/, '').split('/')[0] || undefined);
      if (!id) response = json(400, { errors: [{ field: 'id', message: 'User ID required' }] });
      else response = await handleGetUser({ ...event, pathParameters: { ...event.pathParameters, id } });
    } else response = json(404, { code: 'NOT_FOUND', message: 'Route not found' });

    devLog('identity response', { method, path, statusCode: (response as { statusCode?: number }).statusCode });
    return response;
  } catch (err) {
    console.error('Identity handler error', err);
    devLog('identity handler error', { method, path, error: String(err) });
    return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
