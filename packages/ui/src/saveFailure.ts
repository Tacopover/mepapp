const LOCK_ERROR_NAMES = new Set(['NoModificationAllowedError', 'InvalidStateError', 'NotAllowedError']);
const LOCK_MESSAGE = /\block(ed)?\b|being used|sharing violation|could not be read|permission|\baccess\b|os error (16|32|33)|resource busy/i;

/** The key of the failure toast of one document. */
export const saveFailureKey = (documentId: string | null): string => `save-failure:${documentId ?? ''}`;

const errorName = (err: unknown): string => (typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : '');

const errorMessage = (err: unknown): string => {
  if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
  return typeof err === 'string' ? err : '';
};

/** The user cancelled the picker. This is not a failed save. */
export function isSaveCancelled(err: unknown): boolean {
  return errorName(err) === 'AbortError';
}

/** True when the write failed because another program may hold the file or the file is not writable. */
export function isLockedFileError(err: unknown): boolean {
  return LOCK_ERROR_NAMES.has(errorName(err)) || LOCK_MESSAGE.test(errorMessage(err));
}

/** The text of the persistent toast after a failed write of a PDF. */
export function saveFailureText(err: unknown, fileName: string): string {
  if (isLockedFileError(err)) {
    return `Could not save ${fileName}. Another program may have the file open. Close it there and save again. Your changes are still in MepApp.`;
  }
  const detail = errorMessage(err).trim().replace(/\.+$/, '');
  return detail === ''
    ? `Could not save ${fileName}. Your changes are still in MepApp.`
    : `Could not save ${fileName}. ${detail}. Your changes are still in MepApp.`;
}

/** The text of the persistent toast when the PDF was saved but the building summary write failed. */
export function summaryFailureText(err: unknown, fileName: string): string {
  const detail = errorMessage(err).trim();
  return `Saved ${fileName}, but the building summary was not written.${detail === '' ? '' : ` ${detail.replace(/\.+$/, '')}.`}`;
}
