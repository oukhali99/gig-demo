import {
  DynamoDBClient,
  PutItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { EventEnvelope } from './lib/index.js';
import { devLog } from './lib/index.js';

const ddb = new DynamoDBClient({});
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? '';

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : '';
}

/** Build per-user notification rows from domain event (idempotent per user per eventId). */
function notificationsFromEnvelope(env: EventEnvelope): { userId: string; title: string; body: string }[] {
  const t = env.eventType;
  const p = env.payload ?? {};
  const out: { userId: string; title: string; body: string }[] = [];
  const add = (userId: string, title: string, body: string) => {
    if (userId) out.push({ userId, title, body });
  };
  const cid = str(p, 'clientId');
  const wid = str(p, 'workerId');
  const jobId = str(p, 'jobId');
  const bookingId = str(p, 'bookingId');

  switch (t) {
    case 'job.created':
      add(cid, 'Job draft created', `Job ${jobId.slice(0, 8)}… saved`);
      break;
    case 'job.published':
      add(cid, 'Job published', `Job ${jobId.slice(0, 8)}… is live`);
      break;
    case 'job.closed':
      add(cid, 'Job closed', `Job ${jobId.slice(0, 8)}… was closed`);
      break;
    case 'job.deleted':
      add(cid, 'Draft deleted', `Job ${jobId.slice(0, 8)}… was removed`);
      break;
    case 'booking.created':
      add(cid, 'New booking request', `Someone requested booking ${bookingId.slice(0, 8)}…`);
      break;
    case 'booking.confirmed':
      add(wid, 'Booking confirmed', `Booking ${bookingId.slice(0, 8)}… confirmed`);
      break;
    case 'booking.in_progress':
      add(cid, 'Work started', `Worker started booking ${bookingId.slice(0, 8)}…`);
      break;
    case 'booking.completed':
      add(cid, 'Booking completed', `Booking ${bookingId.slice(0, 8)}… completed`);
      add(wid, 'Booking completed', `Booking ${bookingId.slice(0, 8)}… completed`);
      break;
    case 'booking.cancelled':
      add(cid, 'Booking cancelled', `Booking ${bookingId.slice(0, 8)}… cancelled`);
      add(wid, 'Booking cancelled', `Booking ${bookingId.slice(0, 8)}… cancelled`);
      break;
    case 'payment.hold.created':
      add(cid, 'Payment hold', `Hold placed for booking ${bookingId.slice(0, 8)}…`);
      add(wid, 'Payment hold', `Hold placed for booking ${bookingId.slice(0, 8)}…`);
      break;
    case 'payment.completed':
      add(wid, 'Payment released', `Payment released for booking ${bookingId.slice(0, 8)}…`);
      add(cid, 'Payment released', `Payment released for booking ${bookingId.slice(0, 8)}…`);
      break;
    case 'payment.refunded':
      add(cid, 'Payment refunded', `Refund for booking ${bookingId.slice(0, 8)}…`);
      add(wid, 'Payment refunded', `Refund for booking ${bookingId.slice(0, 8)}…`);
      break;
    default:
      break;
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.userId)) return false;
    seen.add(x.userId);
    return true;
  });
}

async function persistNotification(
  userId: string,
  eventId: string,
  eventType: string,
  title: string,
  body: string,
  createdAt: string
): Promise<void> {
  try {
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          userId,
          eventId,
          eventType,
          title,
          body,
          read: false,
          createdAt,
        }),
        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(eventId)',
      })
    );
  } catch (e: unknown) {
    if (e instanceof ConditionalCheckFailedException) return;
    throw e;
  }
}

/** In-process fan-out: write notification inbox rows for an envelope (replaces EventBridge → notifications Lambda). */
export async function broadcastEvent(envelope: EventEnvelope): Promise<void> {
  if (!tableName) {
    devLog('broadcast skip: no NOTIFICATIONS_TABLE_NAME', {});
    return;
  }
  const eventId = envelope.eventId;
  const createdAt = envelope.timestamp ?? new Date().toISOString();
  const rows = notificationsFromEnvelope(envelope);
  await Promise.all(
    rows.map((r) => persistNotification(r.userId, eventId, envelope.eventType, r.title, r.body, createdAt))
  );
}
