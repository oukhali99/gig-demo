import { describe, expect, it } from 'vitest';
import { ASSISTANT_PURPOSES, isAssistantPurpose, systemPromptForPurpose } from './purposes.js';

describe('isAssistantPurpose', () => {
  it('accepts each known purpose', () => {
    for (const p of ASSISTANT_PURPOSES) expect(isAssistantPurpose(p)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isAssistantPurpose('chat')).toBe(false);
    expect(isAssistantPurpose('')).toBe(false);
    expect(isAssistantPurpose('JOB_DRAFT')).toBe(false);
  });
});

describe('systemPromptForPurpose', () => {
  it('returns a job-posting prompt for job_draft', () => {
    const p = systemPromptForPurpose('job_draft');
    expect(p).toContain('gig job postings');
    expect(p).toContain('Rules:'); // shared rules are appended
  });

  it('returns a profile-bio prompt for profile_bio', () => {
    const p = systemPromptForPurpose('profile_bio');
    expect(p).toContain('profile bios');
    expect(p).toContain('Rules:');
  });

  it('gives distinct prompts per purpose', () => {
    expect(systemPromptForPurpose('job_draft')).not.toBe(systemPromptForPurpose('profile_bio'));
  });
});
