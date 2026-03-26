import type { S3Event } from 'aws-lambda';
import {
  moderateImageInBucket,
  setObjectModerationStateInBucket,
  deleteObjectInBucket,
} from './shared/images.js';
import { ensureLambdaConfigFromSsm } from './config/ssm.js';

function decodeS3Key(rawKey: string): string {
  return decodeURIComponent(rawKey.replace(/\+/g, ' '));
}

function isModeratedImagePath(key: string): boolean {
  return key.startsWith('jobs/') || key.startsWith('bookings/');
}

export async function handler(event: S3Event): Promise<void> {
  await ensureLambdaConfigFromSsm();

  await Promise.all(
    (event.Records ?? []).map(async (record) => {
      const bucket = record.s3.bucket.name;
      const key = decodeS3Key(record.s3.object.key);
      if (!isModeratedImagePath(key)) return;

      const moderation = await moderateImageInBucket(bucket, key);
      if (moderation.allowed) {
        await setObjectModerationStateInBucket(bucket, key, 'approved');
        return;
      }

      // Rejected objects are deleted immediately; no rejected tag is written.
      await deleteObjectInBucket(bucket, key).catch(() => {});
    })
  );
}
