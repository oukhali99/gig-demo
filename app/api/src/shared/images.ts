import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

const BUCKET = process.env.BUCKET_NAME!;
const PRESIGN_PUT_EXPIRES = 300;
const PRESIGN_GET_EXPIRES = 3600;

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});

const MODERATION_CONFIDENCE_THRESHOLD = 50;

export function getPresignedPutUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_PUT_EXPIRES }
  );
}

export async function getPresignedGetUrl(key: string): Promise<string> {
  const s3Url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: PRESIGN_GET_EXPIRES }
  );
  const cdnBase = process.env.IMAGES_CDN_BASE_URL?.replace(/\/$/, '');
  if (!cdnBase) return s3Url;
  const u = new URL(s3Url);
  return `${cdnBase}${u.pathname}${u.search}`;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function moderateImage(key: string): Promise<{ allowed: boolean; reason?: string }> {
  const result = await rekognition.send(
    new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: BUCKET, Name: key } },
      MinConfidence: MODERATION_CONFIDENCE_THRESHOLD,
    })
  );
  const labels = result.ModerationLabels ?? [];
  if (labels.length === 0) return { allowed: true };
  const top = labels[0];
  return {
    allowed: false,
    reason: `Image moderation: ${top.Name ?? 'Inappropriate content'} (confidence ${top.Confidence?.toFixed(0) ?? 0}%). Please use appropriate images only.`,
  };
}
