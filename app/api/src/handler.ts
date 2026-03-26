import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ensureLambdaConfigFromSsm } from './config/ssm.js';
import { json } from './lib/api-helpers.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  await ensureLambdaConfigFromSsm();

  const path = event.rawPath ?? '';

  if (path.startsWith('/auth') || path.startsWith('/users')) {
    const { handleIdentity } = await import('./identity/http.js');
    return handleIdentity(event);
  }
  if (path.startsWith('/jobs')) {
    const { handleJobs } = await import('./jobs/http.js');
    return handleJobs(event);
  }
  if (path.startsWith('/bookings')) {
    const { handleBookings } = await import('./bookings/http.js');
    return handleBookings(event);
  }
  if (path.startsWith('/payments')) {
    const { handlePayments } = await import('./payments/http.js');
    return handlePayments(event);
  }
  if (path.startsWith('/notifications')) {
    const { handleNotifications } = await import('./notifications/http.js');
    return handleNotifications(event);
  }
  if (path.startsWith('/reviews')) {
    const { handleReviews } = await import('./reviews/http.js');
    return handleReviews(event);
  }
  if (path.startsWith('/moderation')) {
    const { handleModeration } = await import('./moderation/http.js');
    return handleModeration(event);
  }

  return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
}
