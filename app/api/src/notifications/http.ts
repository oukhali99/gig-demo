import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { json, getSubFromEvent } from '../lib/index.js';

const ddb = new DynamoDBClient({});
const tableName = process.env.NOTIFICATIONS_TABLE_NAME ?? '';

export async function handleNotifications(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '';
  if (method !== 'GET' || path !== '/notifications') {
    return json(404, { code: 'NOT_FOUND', message: 'Route not found' });
  }

  const sub = getSubFromEvent(event);
  if (!sub) return json(401, { code: 'UNAUTHORIZED', message: 'Authentication required' });

  const limitRaw = event.queryStringParameters?.limit;
  const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20)) : 20;

  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: marshall({ ':u': sub }),
        Limit: limit,
        ScanIndexForward: false,
      })
    );

    const items = (res.Items ?? []).map((it) => {
      const o = unmarshall(it) as Record<string, unknown>;
      return {
        eventId: o.eventId,
        eventType: o.eventType,
        title: o.title,
        body: o.body,
        read: o.read,
        createdAt: o.createdAt,
      };
    });
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return json(200, { items });
  } catch (err) {
    console.error('notifications HTTP error', err);
    return json(500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
