import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';

const BUCKET = process.env.BUCKET_NAME!;
const PRESIGN_PUT_EXPIRES = 300;
/** Presigned S3 GET for admin preview of objects not readable via CDN (e.g. pending_review). */
export const PRESIGN_GET_PREVIEW_EXPIRES_SEC = 300;

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});

const MODERATION_TAG_KEY = 'moderation';
export const MODERATION_APPROVED = 'approved';
export const MODERATION_PENDING_REVIEW = 'pending_review';

export type ImageModerationState = 'approved' | 'pending_review' | 'pending';

export type ImageModerationDecision = 'approve' | 'pending_review' | 'reject';

export type ImageModerationOutcome = {
  decision: ImageModerationDecision;
  reason?: string;
  topLabel?: string;
  maxConfidence?: number;
};

function parseConfidenceThreshold(name: string, defaultVal: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(max, Math.max(min, n));
}

/** Rekognition MinConfidence (0–100). Labels below this are not returned. */
export function imageModerationRekognitionMinConfidence(): number {
  return parseConfidenceThreshold('IMAGE_MODERATION_REKOGNITION_MIN_CONFIDENCE', 40, 1, 99);
}

/** Inclusive lower bound of the manual-review band (0–100). Must be below auto-reject in Terraform. */
export function imageModerationManualReviewMinConfidence(): number {
  return parseConfidenceThreshold('IMAGE_MODERATION_MANUAL_REVIEW_MIN_CONFIDENCE', 55, 0, 100);
}

/** Inclusive lower bound for auto-rejection (0–100). */
export function imageModerationAutoRejectMinConfidence(): number {
  return parseConfidenceThreshold('IMAGE_MODERATION_AUTO_REJECT_MIN_CONFIDENCE', 75, 1, 100);
}

/**
 * Classifies Rekognition moderation labels using configured thresholds on max label confidence (0–100).
 */
export function classifyImageModerationFromLabels(
  labels: { Name?: string; Confidence?: number }[],
  manualReviewMin: number,
  autoRejectMin: number
): ImageModerationOutcome {
  if (labels.length === 0) {
    return { decision: 'approve' };
  }
  let maxConf = 0;
  let topName: string | undefined;
  for (const l of labels) {
    const c = l.Confidence ?? 0;
    if (c > maxConf) {
      maxConf = c;
      topName = l.Name;
    }
  }
  if (maxConf >= autoRejectMin) {
    return {
      decision: 'reject',
      topLabel: topName,
      maxConfidence: maxConf,
      reason: `Image moderation: ${topName ?? 'Inappropriate content'} (confidence ${maxConf.toFixed(0)}%). Auto-rejected.`,
    };
  }
  if (maxConf >= manualReviewMin) {
    return {
      decision: 'pending_review',
      topLabel: topName,
      maxConfidence: maxConf,
      reason: `Image moderation: ${topName ?? 'Flagged content'} (confidence ${maxConf.toFixed(0)}%) pending manual review.`,
    };
  }
  return { decision: 'approve', topLabel: topName, maxConfidence: maxConf };
}

export function getPresignedPutUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_PUT_EXPIRES }
  );
}

/** Direct S3 GET (bypasses CloudFront, which only serves approved objects). */
export function getPresignedS3GetObjectUrl(
  key: string,
  expiresIn = PRESIGN_GET_PREVIEW_EXPIRES_SEC
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
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
    if (value === MODERATION_PENDING_REVIEW) return 'pending_review';
    return 'pending';
  } catch {
    return 'pending';
  }
}

export type ModerationTagValue = typeof MODERATION_APPROVED | typeof MODERATION_PENDING_REVIEW;

export async function setObjectModerationStateInBucket(
  bucket: string,
  key: string,
  state: ModerationTagValue
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

export async function setObjectModerationTag(key: string, state: ModerationTagValue): Promise<void> {
  await setObjectModerationStateInBucket(BUCKET, key, state);
}

export type PendingImageRow = { key: string; lastModified?: string };

/**
 * Lists one page of objects under jobs/ or bookings/ and returns those tagged pending_review.
 * Caller paginates with nextCursor until undefined, then may switch prefix.
 */
export async function listPendingReviewPage(
  prefix: 'jobs/' | 'bookings/',
  continuationToken?: string,
  maxKeys = 40
): Promise<{ items: PendingImageRow[]; nextCursor?: string }> {
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    })
  );
  const items: PendingImageRow[] = [];
  for (const obj of out.Contents ?? []) {
    const k = obj.Key;
    if (!k || k.endsWith('/')) continue;
    const st = await getObjectModerationState(k);
    if (st === 'pending_review') {
      items.push({ key: k, lastModified: obj.LastModified?.toISOString() });
    }
  }
  return {
    items,
    nextCursor: out.IsTruncated ? out.NextContinuationToken : undefined,
  };
}

export async function moderateImage(key: string): Promise<ImageModerationOutcome> {
  return moderateImageInBucket(BUCKET, key);
}

export async function moderateImageInBucket(bucket: string, key: string): Promise<ImageModerationOutcome> {
  const rekMin = imageModerationRekognitionMinConfidence();
  const manualMin = imageModerationManualReviewMinConfidence();
  const autoRejectMin = imageModerationAutoRejectMinConfidence();
  const effectiveManual = manualMin < autoRejectMin ? manualMin : Math.max(0, autoRejectMin - 1);

  const result = await rekognition.send(
    new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MinConfidence: rekMin,
    })
  );
  const labels = result.ModerationLabels ?? [];
  return classifyImageModerationFromLabels(labels, effectiveManual, autoRejectMin);
}
