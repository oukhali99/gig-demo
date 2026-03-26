import type { S3Event } from 'aws-lambda';
import * as bookingsRepo from './bookings/repository.js';
import { ensureLambdaConfigFromSsm } from './config/ssm.js';
import * as jobsRepo from './jobs/repository.js';
import {
  moderateImageInBucket,
  setObjectModerationStateInBucket,
  deleteObjectInBucket,
} from './shared/images.js';

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
      if (moderation.decision === 'approve') {
        await setObjectModerationStateInBucket(bucket, key, 'approved');
        return;
      }
      if (moderation.decision === 'pending_review') {
        await setObjectModerationStateInBucket(bucket, key, 'pending_review');
        console.log(
          JSON.stringify({
            msg: 'image_moderation_pending_review',
            key,
            topLabel: moderation.topLabel,
            maxConfidence: moderation.maxConfidence,
          })
        );
        return;
      }

      const updatedAt = new Date().toISOString();
      try {
        if (key.startsWith('jobs/')) {
          const jobId = key.split('/')[1];
          if (jobId) await jobsRepo.removeJobImageKey(jobId, key, updatedAt);
        } else {
          const bookingId = key.split('/')[1];
          if (bookingId) await bookingsRepo.removeBookingImageKey(bookingId, key, updatedAt);
        }
      } catch (err) {
        console.error(
          JSON.stringify({ msg: 'remove_image_key_from_record_failed', key, error: String(err) })
        );
      }
      await deleteObjectInBucket(bucket, key).catch(() => {});
    })
  );
}
