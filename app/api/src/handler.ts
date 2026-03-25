import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { json } from './lib/index.js';
import { handleIdentity } from './identity/http.js';
import { handleJobs } from './jobs/http.js';
import { handleBookings } from './bookings/http.js';
import { handlePayments } from './payments/http.js';
import { handleNotifications } from './notifications/http.js';
import { handleReviews } from './reviews/http.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const path = event.rawPath ?? '';

  if (path.startsWith('/auth') || path.startsWith('/users')) {
    return handleIdentity(event);
  }
  if (path.startsWith('/jobs')) {
    return handleJobs(event);
  }
  if (path.startsWith('/bookings')) {
    return handleBookings(event);
  }
  if (path.startsWith('/payments')) {
    return handlePayments(event);
  }
  if (path.startsWith('/notifications')) {
    return handleNotifications(event);
  }
  if (path.startsWith('/reviews')) {
    return handleReviews(event);
  }

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
