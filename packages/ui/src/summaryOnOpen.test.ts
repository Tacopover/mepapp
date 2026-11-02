import { describe, expect, it } from 'vitest';
import { shouldWriteSummaryOnOpen } from './summaryOnOpen.js';

const base = { projectUuidInFile: true, loadMismatch: false, outcome: { kind: 'none' as const } };

describe('shouldWriteSummaryOnOpen', () => {
  it('writes for a document that opens without a known duplicate', () => {
    expect(shouldWriteSummaryOnOpen(base)).toBe(true);
  });

  it('writes for a moved document', () => {
    const outcome = { kind: 'moved' as const, projectUuid: 'uuid-a', location: { fileName: 'a.pdf', sizeBytes: 1 }, sheetName: 'Plan' };
    expect(shouldWriteSummaryOnOpen({ ...base, outcome })).toBe(true);
  });

  it('does not write for a copy the user did not confirm', () => {
    const outcome = { kind: 'ask' as const, verdict: 'copy' as const, projectUuid: 'uuid-a', location: { fileName: 'a.pdf', sizeBytes: 1 }, storedName: 'a.pdf' };
    expect(shouldWriteSummaryOnOpen({ ...base, outcome })).toBe(false);
  });

  it('writes for an unclear match after the user picked "It is the same file"', () => {
    const outcome = { kind: 'ask' as const, verdict: 'unclear' as const, projectUuid: 'uuid-a', location: { fileName: 'a.pdf', sizeBytes: 1 }, storedName: 'a.pdf' };
    expect(shouldWriteSummaryOnOpen({ ...base, outcome, afterSameFile: true })).toBe(true);
  });

  it('does not write for a minted in-memory id', () => {
    expect(shouldWriteSummaryOnOpen({ ...base, projectUuidInFile: false })).toBe(false);
  });

  it('does not write when the load reported a mismatch', () => {
    expect(shouldWriteSummaryOnOpen({ ...base, loadMismatch: true })).toBe(false);
  });

  it('does not write when the identity check failed', () => {
    expect(shouldWriteSummaryOnOpen({ ...base, outcome: null })).toBe(false);
  });
});
