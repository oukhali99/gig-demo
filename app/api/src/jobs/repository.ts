import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { Job, UpdateJobInput, ListJobsQuery, ListJobsResult } from './types.js';

const TABLE_NAME = process.env.JOBS_TABLE_NAME!;

const client = new DynamoDBClient({});

export async function createJob(job: Job): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(job, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(jobId)',
    })
  );
}

export async function getJob(jobId: string): Promise<Job | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ jobId }),
    })
  );
  if (!result.Item) return null;
  return unmarshall(result.Item) as Job;
}

export async function updateJob(
  jobId: string,
  input: UpdateJobInput,
  updatedAt: string
): Promise<Job | null> {
  const updates: string[] = ['updatedAt = :updatedAt'];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':updatedAt': updatedAt };

  if (input.title !== undefined) {
    names['#title'] = 'title';
    values[':title'] = input.title;
    updates.push('#title = :title');
  }
  if (input.categoryId !== undefined) {
    names['#categoryId'] = 'categoryId';
    values[':categoryId'] = input.categoryId;
    updates.push('#categoryId = :categoryId');
  }
  if (input.location !== undefined) {
    names['#location'] = 'location';
    values[':location'] = input.location;
    updates.push('#location = :location');
  }
  if (input.description !== undefined) {
    names['#description'] = 'description';
    values[':description'] = input.description;
    updates.push('#description = :description');
  }
  if (input.budget !== undefined) {
    names['#budget'] = 'budget';
    values[':budget'] = input.budget;
    updates.push('#budget = :budget');
  }
  if (input.scheduledAt !== undefined) {
    names['#scheduledAt'] = 'scheduledAt';
    values[':scheduledAt'] = input.scheduledAt;
    updates.push('#scheduledAt = :scheduledAt');
  }

  if (updates.length === 1) return getJob(jobId);

  const result = await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ jobId }),
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: marshall(values),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Job;
}

export async function addJobImageKey(jobId: string, imageKey: string, updatedAt: string): Promise<Job | null> {
  const result = await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ jobId }),
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
  return unmarshall(result.Attributes) as Job;
}

export async function deleteJob(jobId: string, clientId: string): Promise<boolean> {
  await client.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ jobId }),
      ConditionExpression: '#status = :draft AND clientId = :cid',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({ ':draft': 'draft', ':cid': clientId }),
    })
  );
  return true;
}

export async function updateJobStatus(
  jobId: string,
  status: Job['status'],
  updatedAt: string,
  reason?: string
): Promise<Job | null> {
  const updates = ['#status = :status', 'updatedAt = :updatedAt'];
  const values: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': updatedAt,
  };
  if (reason !== undefined) {
    updates.push('closedReason = :reason');
    values[':reason'] = reason;
  }
  const result = await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ jobId }),
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall(values),
      ReturnValues: 'ALL_NEW',
    })
  );
  if (!result.Attributes) return null;
  return unmarshall(result.Attributes) as Job;
}

export async function listJobs(query: ListJobsQuery): Promise<ListJobsResult> {
  const limit = Math.min(query.limit ?? 20, 100);
  const indexName = 'status-createdAt-index';

  const status = query.status ?? 'published';
  const keyCondition = '#status = :status';
  const exprNames: Record<string, string> = { '#status': 'status' };
  const exprValues: Record<string, unknown> = { ':status': status };

  const queryInput: QueryCommandInput = {
    TableName: TABLE_NAME,
    IndexName: indexName,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: marshall(exprValues),
    Limit: limit,
    ScanIndexForward: false,
  };
  if (query.cursor) {
    try {
      const parsed = JSON.parse(
        Buffer.from(query.cursor, 'base64url').toString('utf8')
      ) as Record<string, unknown>;
      queryInput.ExclusiveStartKey = marshall(parsed);
    } catch {
      // ignore invalid cursor
    }
  }

  const result = await client.send(new QueryCommand(queryInput));
  let items = (result.Items ?? []).map((i) => unmarshall(i) as Job);

  if (query.category) {
    items = items.filter((j) => j.categoryId === query.category);
  }
  if (query.location) {
    const loc = query.location.toLowerCase();
    items = items.filter((j) => j.location.toLowerCase().includes(loc));
  }

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey), 'utf8').toString('base64url')
    : undefined;

  return { items, nextCursor };
}

export async function listJobsByClient(clientId: string, limit?: number, cursor?: string): Promise<ListJobsResult> {
  const pageSize = Math.min(limit ?? 20, 100);
  const queryInput: QueryCommandInput = {
    TableName: TABLE_NAME,
    IndexName: 'clientId-createdAt-index',
    KeyConditionExpression: 'clientId = :cid',
    ExpressionAttributeValues: marshall({ ':cid': clientId }),
    Limit: pageSize,
    ScanIndexForward: false,
  };
  if (cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
      queryInput.ExclusiveStartKey = marshall(parsed);
    } catch {
      // ignore
    }
  }
  const result = await client.send(new QueryCommand(queryInput));
  const items = (result.Items ?? []).map((i) => unmarshall(i) as Job);
  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey), 'utf8').toString('base64url')
    : undefined;
  return { items, nextCursor };
}
