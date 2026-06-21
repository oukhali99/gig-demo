import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ensureLambdaConfigFromSsm } from './config/ssm.js';
import { json } from './lib/api-helpers.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // Overlap the (cold-path) SSM fetch with resolving the route's domain module so the
  // network round-trip and module init run concurrently instead of serially.
  const configReady = ensureLambdaConfigFromSsm();

  const path = event.rawPath ?? '';

  const route = await resolveRoute(path);
  if (!route) {
    await configReady;
    return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
  }

  await configReady;
  return route(event);
}

type DomainHandler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

async function resolveRoute(path: string): Promise<DomainHandler | null> {
  if (path.startsWith('/auth') || path.startsWith('/users')) {
    return (await import('./identity/http.js')).handleIdentity;
  }
  if (path.startsWith('/jobs')) {
    return (await import('./jobs/http.js')).handleJobs;
  }
  if (path.startsWith('/bookings')) {
    return (await import('./bookings/http.js')).handleBookings;
  }
  if (path.startsWith('/payments')) {
    return (await import('./payments/http.js')).handlePayments;
  }
  if (path.startsWith('/notifications')) {
    return (await import('./notifications/http.js')).handleNotifications;
  }
  if (path.startsWith('/reviews')) {
    return (await import('./reviews/http.js')).handleReviews;
  }
  if (path.startsWith('/assistant')) {
    return (await import('./assistant/http.js')).handleAssistant;
  }
  if (path.startsWith('/admin')) {
    return (await import('./admin/http.js')).handleAdmin;
  }
  return null;
}
