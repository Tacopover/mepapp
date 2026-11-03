import { describe, expect, it } from 'vitest';
import { findOpenDocumentByPath } from './openDocumentMatch.js';

describe('findOpenDocumentByPath', () => {
  it('returns the id of the open document with the same path', () => {
    const targets = new Map([
      ['d1', { path: 'C:\\plans\\a.pdf' }],
      ['d2', { path: 'C:\\plans\\b.pdf' }],
    ]);
    expect(findOpenDocumentByPath(targets, ['d1', 'd2'], 'C:\\plans\\b.pdf')).toBe('d2');
  });

  it('returns undefined when the path is undefined', () => {
    const targets = new Map([['d1', { path: 'C:\\plans\\a.pdf' }]]);
    expect(findOpenDocumentByPath(targets, ['d1'], undefined)).toBeUndefined();
  });

  it('ignores a target whose document is not in the open ids', () => {
    const targets = new Map([['d1', { path: 'C:\\plans\\a.pdf' }]]);
    expect(findOpenDocumentByPath(targets, ['d2'], 'C:\\plans\\a.pdf')).toBeUndefined();
  });

  it('treats a backslash and a slash, and upper and lower case, as equal', () => {
    const targets = new Map([['d1', { path: 'C:\\Plans\\A.pdf' }]]);
    expect(findOpenDocumentByPath(targets, ['d1'], 'c:/plans/a.pdf')).toBe('d1');
  });

  it('returns undefined for a different path', () => {
    const targets = new Map([['d1', { path: 'C:\\plans\\a.pdf' }]]);
    expect(findOpenDocumentByPath(targets, ['d1'], 'C:\\plans\\other.pdf')).toBeUndefined();
  });

  it('returns the first match in the open ids order', () => {
    const targets = new Map([
      ['d1', { path: '/x/a.pdf' }],
      ['d2', { path: '/x/a.pdf' }],
    ]);
    expect(findOpenDocumentByPath(targets, ['d2', 'd1'], '/x/a.pdf')).toBe('d2');
  });
});
