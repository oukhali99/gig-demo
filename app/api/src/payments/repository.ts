import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Payment, PaymentStatus } from './types.js';

const TABLE_NAME = process.env.PAYMENTS_TABLE_NAME!;
const client = new DynamoDBClient({});

export async function getPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
  const result = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
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
      TableName: TABLE_NAME,
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
      TableName: TABLE_NAME,
      Item: marshall(item, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(paymentId)',
    })
  );
}

export async function getPayment(paymentId: string): Promise<Payment | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
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
      TableName: TABLE_NAME,
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
