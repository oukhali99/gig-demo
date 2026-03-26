import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

const BUCKET = process.env.BUCKET_NAME!;
const PRESIGN_PUT_EXPIRES = 300;

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});

const MODERATION_CONFIDENCE_THRESHOLD = 50;
const MODERATION_TAG_KEY = 'moderation';
const MODERATION_APPROVED = 'approved';

export type ImageModerationState = 'approved' | 'pending';

export function getPresignedPutUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_PUT_EXPIRES }
  );
}

export async function getPresignedGetUrl(key: string): Promise<string> {
  const cdnBase = process.env.IMAGES_CDN_BASE_URL?.replace(/\/$/, '');
  if (!cdnBase) {
    throw new Error('IMAGES_CDN_BASE_URL is required for image delivery');
  }
  const encodedPath = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${cdnBase}/${encodedPath}`;
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

export async function deleteObjectInBucket(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObjectModerationState(key: string): Promise<ImageModerationState> {
  try {
    const out = await s3.send(new GetObjectTaggingCommand({ Bucket: BUCKET, Key: key }));
    const value = out.TagSet?.find((t) => t.Key === MODERATION_TAG_KEY)?.Value;
    if (value === MODERATION_APPROVED) return 'approved';
    return 'pending';
  } catch {
    return 'pending';
  }
}

export async function setObjectModerationStateInBucket(
  bucket: string,
  key: string,
  state: Extract<ImageModerationState, 'approved'>
): Promise<void> {
  const current = await s3.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key })).catch(() => ({ TagSet: [] }));
  const others = (current.TagSet ?? []).filter((t) => t.Key !== MODERATION_TAG_KEY);
  await s3.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: [...others, { Key: MODERATION_TAG_KEY, Value: state }] },
    })
  );
}

export async function moderateImage(key: string): Promise<{ allowed: boolean; reason?: string }> {
  return moderateImageInBucket(BUCKET, key);
}

export async function moderateImageInBucket(bucket: string, key: string): Promise<{ allowed: boolean; reason?: string }> {
  const result = await rekognition.send(
    new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
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
