import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Booking, BookingStatus, ListBookingsQuery, ListBookingsResult } from './types.js';

const client = new DynamoDBClient({});

function bookingsTableName(): string {
  const name = process.env.BOOKINGS_TABLE_NAME;
  if (!name) throw new Error('BOOKINGS_TABLE_NAME is not set');
  return name;
}

export async function getBookingByIdempotencyKey(idempotencyKey: string): Promise<Booking | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: bookingsTableName(),
      IndexName: 'idempotencyKey-index',
      KeyConditionExpression: 'idempotencyKey = :key',
      ExpressionAttributeValues: marshall({ ':key': idempotencyKey }),
      Limit: 1,
    })
  );
  if (!result.Items?.length) return null;
  return unmarshall(result.Items[0]) as Booking;
}

export async function createBooking(booking: Booking): Promise<void> {
  const item: Record<string, unknown> = {
    bookingId: booking.bookingId,
    jobId: booking.jobId,
    workerId: booking.workerId,
    clientId: booking.clientId,
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
  if (booking.idempotencyKey) item.idempotencyKey = booking.idempotencyKey;

  await client.send(
    new PutItemCommand({
      TableName: bookingsTableName(),
      Item: marshall(item, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(bookingId)',
    })
  );
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: bookingsTableName(),
      Key: marshall({ bookingId }),
    })
  );
  if (!result.Item) return null;
  return unmarshall(result.Item) as Booking;
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  updatedAt: string
): Promise<Booking | null> {
  const result = await client.send(
    new UpdateItemCommand({
      TableName: bookingsTableName(),
      Key: marshall({ bookingId }),
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({ ':status': status, ':updatedAt': updatedAt }),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Booking;
}

export async function addBookingImageKey(bookingId: string, imageKey: string, updatedAt: string): Promise<Booking | null> {
  const result = await client.send(
    new UpdateItemCommand({
      TableName: bookingsTableName(),
      Key: marshall({ bookingId }),
      UpdateExpression: 'SET imageKeys = list_append(if_not_exists(imageKeys, :empty), :newKey), updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall({
        ':empty': [],
        ':newKey': [imageKey],
        ':updatedAt': updatedAt,
      }),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Booking;
}

export async function removeBookingImageKey(
  bookingId: string,
  imageKey: string,
  updatedAt: string
): Promise<Booking | null> {
  const booking = await getBooking(bookingId);
  if (!booking) return null;
  const keys = booking.imageKeys ?? [];
  if (!keys.includes(imageKey)) return booking;

  const newKeys = keys.filter((k) => k !== imageKey);
  const result = await client.send(
    new UpdateItemCommand({
      TableName: bookingsTableName(),
      Key: marshall({ bookingId }),
      UpdateExpression:
        newKeys.length > 0
          ? 'SET imageKeys = :keys, updatedAt = :updatedAt'
          : 'REMOVE imageKeys SET updatedAt = :updatedAt',
      ExpressionAttributeValues: marshall(
        newKeys.length > 0 ? { ':keys': newKeys, ':updatedAt': updatedAt } : { ':updatedAt': updatedAt }
      ),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Booking;
}

function buildListQuery(query: ListBookingsQuery): { indexName: string; keyCondition: string; exprNames: Record<string, string>; exprValues: Record<string, unknown> } {
  if (query.jobId) {
    return {
      indexName: 'jobId-createdAt-index',
      keyCondition: 'jobId = :jobId',
      exprNames: {},
      exprValues: { ':jobId': query.jobId },
    };
  }
  if (query.workerId) {
    return {
      indexName: 'workerId-createdAt-index',
      keyCondition: 'workerId = :workerId',
      exprNames: {},
      exprValues: { ':workerId': query.workerId },
    };
  }
  return {
    indexName: 'status-createdAt-index',
    keyCondition: '#status = :status',
    exprNames: { '#status': 'status' },
    exprValues: { ':status': query.status ?? 'requested' },
  };
}

export async function listBookings(query: ListBookingsQuery): Promise<ListBookingsResult> {
  const { indexName, keyCondition, exprNames, exprValues } = buildListQuery(query);
  const limit = Math.min(query.limit ?? 20, 100);

  const queryInput: QueryCommandInput = {
    TableName: bookingsTableName(),
    IndexName: indexName,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeNames: Object.keys(exprNames).length ? exprNames : undefined,
    ExpressionAttributeValues: marshall(exprValues),
    Limit: limit,
    ScanIndexForward: false,
  };
  if (query.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      queryInput.ExclusiveStartKey = marshall(parsed);
    } catch {
      // ignore invalid cursor
    }
  }

  const result = await client.send(new QueryCommand(queryInput));
  let items = (result.Items ?? []).map((i) => unmarshall(i) as Booking);
  if (query.status && (query.jobId || query.workerId)) {
    items = items.filter((b) => b.status === query.status);
  }
  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey), 'utf8').toString('base64url')
    : undefined;
  return { items, nextCursor };
}
