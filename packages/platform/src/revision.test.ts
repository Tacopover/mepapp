import { describe, expect, it } from 'vitest';
import { StoreConflictError } from './errors.js';
import { checkRevision } from './revision.js';

describe('checkRevision', () => {
  it('does not check when expectedRevision is undefined', () => {
    expect(() => checkRevision('k', undefined, '5')).not.toThrow();
    expect(() => checkRevision('k', undefined, undefined)).not.toThrow();
  });

  it('passes when the revisions match', () => {
    expect(() => checkRevision('k', '5', '5')).not.toThrow();
  });

  it('throws StoreConflictError on mismatch or absent record', () => {
    expect(() => checkRevision('k', '4', '5')).toThrow(StoreConflictError);
    expect(() => checkRevision('k', '4', undefined)).toThrow(StoreConflictError);
  });
});
