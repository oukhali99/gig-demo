import { ComprehendClient, DetectToxicContentCommand } from '@aws-sdk/client-comprehend';

/** Reject when any toxicity label meets or exceeds this score (0–1). */
const TOXIC_SCORE_THRESHOLD = 0.65;

const client = new ComprehendClient({});

export type TextFieldToModerate = { field: string; text: string };

/**
 * Runs Amazon Comprehend DetectToxicContent (English). Empty segments are skipped.
 */
export async function moderateTextFields(
  fields: TextFieldToModerate[]
): Promise<{ allowed: boolean; reason?: string }> {
  const prepared = fields
    .map((f) => ({ field: f.field, text: f.text.trim().slice(0, 1000) }))
    .filter((f) => f.text.length > 0);
  if (prepared.length === 0) return { allowed: true };

  const out = await client.send(
    new DetectToxicContentCommand({
      LanguageCode: 'en',
      TextSegments: prepared.map((p) => ({ Text: p.text })),
    })
  );

  const results = out.ResultList ?? [];
  for (let i = 0; i < results.length; i++) {
    const fieldName = prepared[i]?.field ?? 'content';
    const item = results[i];
    const overall = item?.Toxicity ?? 0;
    if (overall >= TOXIC_SCORE_THRESHOLD) {
      return {
        allowed: false,
        reason: `Text moderation: overall toxicity in ${fieldName} (${(overall * 100).toFixed(0)}% confidence). Please revise.`,
      };
    }
    for (const label of item?.Labels ?? []) {
      const score = label.Score ?? 0;
      if (score >= TOXIC_SCORE_THRESHOLD) {
        return {
          allowed: false,
          reason: `Text moderation: ${label.Name ?? 'Inappropriate content'} in ${fieldName} (${(score * 100).toFixed(0)}% confidence). Please revise.`,
        };
      }
    }
  }
  return { allowed: true };
}

export function moderateJobContent(job: {
  title: string;
  description: string;
  location: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  return moderateTextFields([
    { field: 'title', text: job.title },
    { field: 'description', text: job.description },
    { field: 'location', text: job.location },
  ]);
}
