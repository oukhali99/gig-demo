import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A single controllable spy standing in for ComprehendClient#send.
const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-comprehend', () => ({
  ComprehendClient: class {
    send = sendMock;
  },
  DetectToxicContentCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { moderateJobContent, moderateTextFields } from './text-moderation.js';

const origThreshold = process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD;

beforeEach(() => {
  sendMock.mockReset();
  delete process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD;
});

afterEach(() => {
  if (origThreshold === undefined) delete process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD;
  else process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD = origThreshold;
});

/** The TextSegments sent in the most recent DetectToxicContent command. */
function sentSegments(): { Text: string }[] {
  const cmd = sendMock.mock.calls.at(-1)![0] as { input: { TextSegments: { Text: string }[] } };
  return cmd.input.TextSegments;
}

describe('moderateTextFields', () => {
  it('allows and skips the API call when there is no non-empty text', async () => {
    const result = await moderateTextFields([
      { field: 'title', text: '   ' },
      { field: 'description', text: '' },
    ]);
    expect(result).toEqual({ allowed: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('allows content scoring below the threshold', async () => {
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.2, Labels: [{ Name: 'INSULT', Score: 0.1 }] }] });
    expect(await moderateTextFields([{ field: 'title', text: 'nice job' }])).toEqual({ allowed: true });
  });

  it('blocks on overall toxicity at or above the threshold and names the field + confidence', async () => {
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.9, Labels: [] }] });
    const result = await moderateTextFields([{ field: 'description', text: 'awful' }]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('description');
    expect(result.reason).toContain('90%');
  });

  it('blocks on a single label score above the threshold and names the label', async () => {
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.1, Labels: [{ Name: 'PROFANITY', Score: 0.8 }] }] });
    const result = await moderateTextFields([{ field: 'title', text: 'x' }]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('PROFANITY');
    expect(result.reason).toContain('title');
  });

  it('aligns result indexes to the non-empty fields only', async () => {
    // 'title' is empty and dropped, so ResultList[0] corresponds to 'description'.
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.95, Labels: [] }] });
    const result = await moderateTextFields([
      { field: 'title', text: '' },
      { field: 'description', text: 'bad words' },
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('description');
  });

  it('trims and truncates each segment to 1000 chars before sending', async () => {
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0, Labels: [] }] });
    await moderateTextFields([{ field: 'description', text: `  ${'a'.repeat(1500)}  ` }]);
    const segs = sentSegments();
    expect(segs).toHaveLength(1);
    expect(segs[0].Text).toHaveLength(1000);
  });

  it('honors a custom threshold from the environment', async () => {
    process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD = '0.3';
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.4, Labels: [] }] });
    expect((await moderateTextFields([{ field: 'title', text: 'x' }])).allowed).toBe(false);
  });

  it('falls back to the default threshold for a non-numeric env value', async () => {
    process.env.TEXT_MODERATION_TOXIC_SCORE_THRESHOLD = 'abc';
    // 0.5 is below the 0.65 default → allowed.
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0.5, Labels: [] }] });
    expect((await moderateTextFields([{ field: 'title', text: 'x' }])).allowed).toBe(true);
  });

  it('treats a missing ResultList as allowed', async () => {
    sendMock.mockResolvedValue({});
    expect(await moderateTextFields([{ field: 'title', text: 'x' }])).toEqual({ allowed: true });
  });
});

describe('moderateJobContent', () => {
  it('moderates title, description and location together', async () => {
    sendMock.mockResolvedValue({ ResultList: [{ Toxicity: 0, Labels: [] }, { Toxicity: 0, Labels: [] }, { Toxicity: 0, Labels: [] }] });
    const result = await moderateJobContent({ title: 'Fix sink', description: 'Leaky tap', location: 'Austin' });
    expect(result).toEqual({ allowed: true });
    expect(sentSegments().map((s) => s.Text)).toEqual(['Fix sink', 'Leaky tap', 'Austin']);
  });
});
