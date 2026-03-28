import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Payment, PaymentStatus } from './types.js';

const client = new DynamoDBClient({});

function paymentsTableName(): string {
  const name = process.env.PAYMENTS_TABLE_NAME;
  if (!name) throw new Error('PAYMENTS_TABLE_NAME is not set');
  return name;
}

export async function getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: paymentsTableName(),
      IndexName: 'idempotencyKey-index',
      KeyConditionExpression: 'idempotencyKey = :key',
      ExpressionAttributeValues: marshall({ ':key': idempotencyKey }),
      Limit: 1,
    })
  );
  if (!result.Items?.length) return null;
  return unmarshall(result.Items[0]) as Payment;
}

export async function getPaymentByBookingId(bookingId: string): Promise<Payment | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: paymentsTableName(),
      IndexName: 'bookingId-createdAt-index',
      KeyConditionExpression: 'bookingId = :bid',
      ExpressionAttributeValues: marshall({ ':bid': bookingId }),
      Limit: 1,
      ScanIndexForward: false,
    })
  );
  if (!result.Items?.length) return null;
  return unmarshall(result.Items[0]) as Payment;
}

export async function createPayment(payment: Payment): Promise<void> {
  const item: Record<string, unknown> = {
    paymentId: payment.paymentId,
    bookingId: payment.bookingId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
  if (payment.idempotencyKey) item.idempotencyKey = payment.idempotencyKey;
  if (payment.clientId) item.clientId = payment.clientId;
  if (payment.workerId) item.workerId = payment.workerId;

  await client.send(
    new PutItemCommand({
      TableName: paymentsTableName(),
      Item: marshall(item, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(paymentId)',
    })
  );
}

export async function getPayment(paymentId: string): Promise<Payment | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: paymentsTableName(),
      Key: marshall({ paymentId }),
    })
  );
  if (!result.Item) return null;
  return unmarshall(result.Item) as Payment;
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  updatedAt: string
): Promise<Payment | null> {
  const result = await client.send(
    new UpdateItemCommand({
      TableName: paymentsTableName(),
      Key: marshall({ paymentId }),
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({ ':status': status, ':updatedAt': updatedAt }),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Payment;
}

const MAX_LIST_LIMIT = 100;

/**
 * Payments where the user is client or worker (two GSI queries, merged and deduped).
 */
export async function listPaymentsForParty(sub: string, limit: number): Promise<Payment[]> {
  const cap = Math.min(Math.max(limit, 1), MAX_LIST_LIMIT);
  const perQuery = cap;

  const [asClient, asWorker] = await Promise.all([
    client.send(
      new QueryCommand({
        TableName: paymentsTableName(),
        IndexName: 'clientId-createdAt-index',
        KeyConditionExpression: 'clientId = :sub',
        ExpressionAttributeValues: marshall({ ':sub': sub }),
        Limit: perQuery,
        ScanIndexForward: false,
      })
    ),
    client.send(
      new QueryCommand({
        TableName: paymentsTableName(),
        IndexName: 'workerId-createdAt-index',
        KeyConditionExpression: 'workerId = :sub',
        ExpressionAttributeValues: marshall({ ':sub': sub }),
        Limit: perQuery,
        ScanIndexForward: false,
      })
    ),
  ]);

  const byId = new Map<string, Payment>();
  for (const items of [asClient.Items ?? [], asWorker.Items ?? []]) {
    for (const raw of items) {
      const p = unmarshall(raw) as Payment;
      byId.set(p.paymentId, p);
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return merged.slice(0, cap);
}
