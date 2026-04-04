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
    if (err.name === 'UserNotConfirmedException') {
      return json(403, { code: 'EMAIL_NOT_CONFIRMED', message: 'Please verify your email address before logging in.' });
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

async function handleConfirmSignUp(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<{ email?: string; code?: string }>(event);
  if (!body?.email || !body?.code) {
    return json(400, { errors: [{ field: !body?.email ? 'email' : 'code', message: 'required' }] });
  }
  try {
    await cognito.confirmSignUp(body.email, body.code);
    return json(200, { confirmed: true });
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err.name === 'CodeMismatchException' || err.name === 'ExpiredCodeException') {
      return json(400, { code: 'INVALID_CODE', message: err.name === 'ExpiredCodeException' ? 'Code has expired. Request a new one.' : 'Incorrect code. Please try again.' });
    }
    if (err.name === 'NotAuthorizedException') {
      return json(400, { code: 'ALREADY_CONFIRMED', message: 'This account is already confirmed.' });
    }
    throw e;
  }
}

async function handleResendConfirmation(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody<{ email?: string }>(event);
  if (!body?.email) {
    return json(400, { errors: [{ field: 'email', message: 'required' }] });
  }
  try {
    await cognito.resendConfirmation(body.email);
  } catch (e: unknown) {
    const err = e as { name?: string };
    // Don't reveal whether the account exists
    if (err.name !== 'UserNotFoundException' && err.name !== 'InvalidParameterException' && err.name !== 'NotAuthorizedException') {
      throw e;
    }
  }
  return json(200, { sent: true });
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
  return json(200, { sub: user.sub, email: user.email, name: user.name ?? null, bio: user.bio ?? null });
}

async function handleUpdateUser(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const claims = getClaims(event);
  if (!claims) return json(401, { code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  const currentSub = String(claims.sub ?? claims['cognito:username'] ?? '');
  const id = event.pathParameters?.id;
  if (!id) return json(400, { errors: [{ field: 'id', message: 'User ID required' }] });
  if (id !== currentSub) {
    return json(403, { code: 'FORBIDDEN', message: 'You can only update your own profile' });
  }
  const body = parseBody<{ name?: string; bio?: string }>(event);
  if (!body || typeof body !== 'object') {
    return json(400, { errors: [{ field: 'body', message: 'JSON body required' }] });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const bio = typeof body.bio === 'string' ? body.bio.trim() : undefined;

  if (name !== undefined && name.length > 64) {
    return json(400, { errors: [{ field: 'name', message: 'max 64 characters' }] });
  }
  if (bio !== undefined && bio.length > 512) {
    return json(400, { errors: [{ field: 'bio', message: 'max 512 characters' }] });
  }

  const updated = await cognito.updateUserBySub(id, { name: name ?? '', bio: bio ?? '' });
  if (!updated) return json(404, { code: 'NOT_FOUND', message: 'User not found' });
  return json(200, { sub: updated.sub, email: updated.email, name: updated.name ?? null, bio: updated.bio ?? null });
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
    else if (method === 'POST' && path === '/auth/confirm') response = await handleConfirmSignUp(event);
    else if (method === 'POST' && path === '/auth/resend-confirmation') response = await handleResendConfirmation(event);
    else if (method === 'GET' && path === '/auth/me') response = await handleMe(event);
    else if (path.startsWith('/users/')) {
      const id = event.pathParameters?.id ?? (path.replace(/^\/users\/?/, '').split('/')[0] || undefined);
      if (!id) {
        response = json(400, { errors: [{ field: 'id', message: 'User ID required' }] });
      } else if (method === 'GET') {
        response = await handleGetUser({ ...event, pathParameters: { ...event.pathParameters, id } });
      } else if (method === 'PUT' || method === 'PATCH') {
        response = await handleUpdateUser({ ...event, pathParameters: { ...event.pathParameters, id } });
      } else {
        response = json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
      }
    } else response = json(404, { code: 'NOT_FOUND', message: 'Route not found' });

    devLog('identity response', { method, path, statusCode: (response as { statusCode?: number }).statusCode });
    return response;
  } catch (err) {
    console.error('Identity handler error', err);
    devLog('identity handler error', { method, path, error: String(err) });
    return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
