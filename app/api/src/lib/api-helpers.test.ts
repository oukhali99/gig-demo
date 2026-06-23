import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  badRequest,
  getClaims,
  getCorrelationId,
  getIdempotencyKey,
  getSubFromEvent,
  json,
  notFound,
  parseBody,
} from './api-helpers.js';

/** Minimal event factory — only the fields the helpers read. */
function event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return overrides as APIGatewayProxyEventV2;
}

describe('json', () => {
  const orig = process.env.FRONTEND_PUBLIC_URL;
  afterEach(() => {
    if (orig === undefined) delete process.env.FRONTEND_PUBLIC_URL;
    else process.env.FRONTEND_PUBLIC_URL = orig;
  });

  it('serializes the body and sets JSON + CORS headers', () => {
    delete process.env.FRONTEND_PUBLIC_URL;
    const res = json(200, { a: 1 });
    expect(res).toMatchObject({ statusCode: 200, body: JSON.stringify({ a: 1 }) });
    expect((res as { headers: Record<string, string> }).headers).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });

  it('uses FRONTEND_PUBLIC_URL for the CORS origin when set', () => {
    process.env.FRONTEND_PUBLIC_URL = 'https://app.example.com';
    const res = json(201, {}) as { headers: Record<string, string> };
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });
});

describe('badRequest', () => {
  it('wraps errors in a 400 with an errors array', () => {
    const res = badRequest([{ field: 'title', message: 'required' }]) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ errors: [{ field: 'title', message: 'required' }] });
  });
});

describe('notFound', () => {
  it('produces a 404 with a NOT_FOUND code', () => {
    const res = notFound('no job') as { statusCode: number; body: string };
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ code: 'NOT_FOUND', message: 'no job' });
  });
});

describe('getCorrelationId', () => {
  it('prefers the lowercase x-correlation-id header', () => {
    expect(getCorrelationId(event({ headers: { 'x-correlation-id': 'cid-1' } }))).toBe('cid-1');
  });

  it('accepts the capitalized header variant', () => {
    expect(getCorrelationId(event({ headers: { 'X-Correlation-Id': 'cid-2' } }))).toBe('cid-2');
  });

  it('falls back to the request id', () => {
    const e = event({ requestContext: { requestId: 'req-9' } as APIGatewayProxyEventV2['requestContext'] });
    expect(getCorrelationId(e)).toBe('req-9');
  });

  it('generates a uuid when nothing is present', () => {
    const id = getCorrelationId(event());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('getIdempotencyKey', () => {
  it('reads and trims the lowercase header', () => {
    expect(getIdempotencyKey(event({ headers: { 'idempotency-key': '  key-1  ' } }))).toBe('key-1');
  });

  it('accepts the capitalized variant', () => {
    expect(getIdempotencyKey(event({ headers: { 'Idempotency-Key': 'key-2' } }))).toBe('key-2');
  });

  it('returns null for a missing or whitespace-only key', () => {
    expect(getIdempotencyKey(event({ headers: {} }))).toBeNull();
    expect(getIdempotencyKey(event({ headers: { 'idempotency-key': '   ' } }))).toBeNull();
  });
});

describe('getSubFromEvent', () => {
  it('extracts the JWT sub claim', () => {
    const e = event({
      requestContext: { authorizer: { jwt: { claims: { sub: 'user-1' } } } } as unknown as APIGatewayProxyEventV2['requestContext'],
    });
    expect(getSubFromEvent(e)).toBe('user-1');
  });

  it('returns null when there is no authorizer context', () => {
    expect(getSubFromEvent(event())).toBeNull();
  });
});

describe('getClaims', () => {
  it('returns the full claims object', () => {
    const claims = { sub: 'u1', email: 'a@b.c', 'custom:role': 'admin' };
    const e = event({
      requestContext: { authorizer: { jwt: { claims } } } as unknown as APIGatewayProxyEventV2['requestContext'],
    });
    expect(getClaims(e)).toEqual(claims);
  });

  it('returns null when claims are absent', () => {
    expect(getClaims(event())).toBeNull();
  });
});

describe('parseBody', () => {
  it('parses a JSON body', () => {
    expect(parseBody<{ x: number }>(event({ body: '{"x":1}' }))).toEqual({ x: 1 });
  });

  it('returns null for a missing body', () => {
    expect(parseBody(event())).toBeNull();
  });

  it('returns null for invalid JSON instead of throwing', () => {
    expect(parseBody(event({ body: 'not json' }))).toBeNull();
  });
});
