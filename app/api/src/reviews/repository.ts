import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient, PutItemCommand, QueryCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Review } from './types.js';

const client = new DynamoDBClient({});
const tableName = process.env.REVIEWS_TABLE_NAME ?? '';

export async function createReview(r: Review): Promise<{ ok: true } | { ok: false; duplicate: true }> {
  try {
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          bookingId: r.bookingId,
          reviewerId: r.reviewerId,
          revieweeId: r.revieweeId,
          reviewId: r.reviewId,
          rating: r.rating,
          text: r.text,
          createdAt: r.createdAt,
        }),
        ConditionExpression: 'attribute_not_exists(bookingId) AND attribute_not_exists(reviewerId)',
      })
    );
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof ConditionalCheckFailedException) return { ok: false, duplicate: true };
    throw e;
  }
}

export async function listByReviewee(
  revieweeId: string,
  limit: number,
  cursor?: string
): Promise<{ items: Review[]; nextCursor?: string }> {
  let exclusiveStartKey: Record<string, AttributeValue> | undefined;
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
        string,
        AttributeValue
      >;
    } catch {
      exclusiveStartKey = undefined;
    }
  }

  const res = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'revieweeId-createdAt-index',
      KeyConditionExpression: 'revieweeId = :r',
      ExpressionAttributeValues: marshall({ ':r': revieweeId }),
      Limit: limit,
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const items = (res.Items ?? []).map((it) => {
    const o = unmarshall(it) as Record<string, unknown>;
    return {
      reviewId: String(o.reviewId),
      bookingId: String(o.bookingId),
      reviewerId: String(o.reviewerId),
      revieweeId: String(o.revieweeId),
      rating: Number(o.rating),
      text: String(o.text ?? ''),
      createdAt: String(o.createdAt),
    };
  });

  let nextCursor: string | undefined;
  if (res.LastEvaluatedKey && Object.keys(res.LastEvaluatedKey).length > 0) {
    nextCursor = Buffer.from(JSON.stringify(res.LastEvaluatedKey), 'utf8').toString('base64url');
  }
  return { items, nextCursor };
}
