import { describe, expect, it } from 'vitest';
import { isSaveCancelled, saveFailureText, summaryFailureText } from './saveFailure.js';

const LOCKED = 'Could not save plan.pdf. Another program may have the file open. Close it there and save again. Your changes are still in MepApp.';

describe('saveFailureText', () => {
  it.each(['NoModificationAllowedError', 'InvalidStateError', 'NotAllowedError'])('gives the locked text for %s', (name) => {
    expect(saveFailureText(new DOMException('x', name), 'plan.pdf')).toBe(LOCKED);
  });

  it.each([
    'The file is locked',
    'The process cannot access the file because it is being used by another process',
    'Sharing violation',
    'The requested file could not be read',
    'Permission denied',
  ])('gives the locked text for the message "%s"', (message) => {
    expect(saveFailureText(new Error(message), 'plan.pdf')).toBe(LOCKED);
  });

  it('does not treat "blocked" as a lock', () => {
    expect(saveFailureText(new Error('Write blocked by a security tool'), 'plan.pdf')).toBe('Could not save plan.pdf. Write blocked by a security tool. Your changes are still in MepApp.');
  });

  it('shows the browser message for another error, with one full stop', () => {
    expect(saveFailureText(new Error('Disk is full'), 'plan.pdf')).toBe('Could not save plan.pdf. Disk is full. Your changes are still in MepApp.');
  });

  it('does not double the full stop when the message ends with one', () => {
    const text = saveFailureText(new Error('Disk is full.'), 'plan.pdf');
    expect(text).toBe('Could not save plan.pdf. Disk is full. Your changes are still in MepApp.');
    expect(text).not.toContain('..');
    expect(text).not.toContain('. .');
  });

  it('handles an empty message, a string message and a non-error value', () => {
    expect(saveFailureText(new Error(''), 'a.pdf')).toBe('Could not save a.pdf. Your changes are still in MepApp.');
    expect(saveFailureText('Disk is full', 'a.pdf')).toBe('Could not save a.pdf. Disk is full. Your changes are still in MepApp.');
    expect(saveFailureText(undefined, 'a.pdf')).toBe('Could not save a.pdf. Your changes are still in MepApp.');
  });
});

describe('isSaveCancelled', () => {
  it('is true for an AbortError only', () => {
    expect(isSaveCancelled(new DOMException('cancelled', 'AbortError'))).toBe(true);
    expect(isSaveCancelled(new Error('x'))).toBe(false);
    expect(isSaveCancelled(null)).toBe(false);
  });
});

describe('summaryFailureText', () => {
  it('names the saved file and adds the message', () => {
    expect(summaryFailureText(new Error('Store is full'), 'plan.pdf')).toBe('Saved plan.pdf, but the building summary was not written. Store is full.');
  });
});
