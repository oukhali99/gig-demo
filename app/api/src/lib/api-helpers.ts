import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

export function badRequest(errors: { field: string; message: string }[]): APIGatewayProxyResultV2 {
  return json(400, { errors });
}

export function notFound(message: string): APIGatewayProxyResultV2 {
  return json(404, { code: 'NOT_FOUND', message });
}

export function getCorrelationId(event: APIGatewayProxyEventV2): string {
  const h = event.headers as Record<string, string | undefined> | undefined;
  return h?.['x-correlation-id'] ?? h?.['X-Correlation-Id'] ?? event.requestContext?.requestId ?? randomUUID();
}

export function getIdempotencyKey(event: APIGatewayProxyEventV2): string | null {
  const h = event.headers as Record<string, string | undefined> | undefined;
  const key = h?.['idempotency-key'] ?? h?.['Idempotency-Key'];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function getSubFromEvent(event: APIGatewayProxyEventV2): string | null {
  const ctx = event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, string> } } };
  return ctx?.authorizer?.jwt?.claims?.sub ?? null;
}

export function getClaims(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  const ctx = event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
  return ctx?.authorizer?.jwt?.claims ?? null;
}

export function parseBody<T>(event: APIGatewayProxyEventV2): T | null {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
}
