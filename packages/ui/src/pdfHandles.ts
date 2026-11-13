import type { BuildingSheet } from '@mepapp/core';
import type { FileTarget, OpenedFile } from '@mepapp/platform';
import { pdfHandleFileKey } from '@mepapp/platform';

interface FileHandleLike {
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<string>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<string>;
}

export type StoredOpenOutcome =
  | { kind: 'opened'; opened: OpenedFile }
  | { kind: 'denied' } // the user did not allow access. The handle stays.
  | { kind: 'gone' } // the file is moved, renamed or deleted, or the stored value is not a file handle. Delete the handle.
  | { kind: 'changed' } // the file has another size than the sheet. Delete the handle.
  | { kind: 'failed' }; // another read error. The handle stays.

/** The stored value, or undefined when the value is not a file handle (no getFile function). */
export function asFileHandle(value: unknown): FileHandleLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { getFile?: unknown };
  return typeof candidate.getFile === 'function' ? (value as FileHandleLike) : undefined;
}

/** The target when it is a file handle (has getFile), else undefined. Used before a handle is stored. */
export function storableHandle(target: FileTarget | undefined): FileHandleLike | undefined {
  return asFileHandle(target);
}

/** key of the sheet (fileName:size) or undefined when the sheet has no size. */
export function sheetFileKey(sheet: BuildingSheet): string | undefined {
  const size = sheet.location.sizeBytes;
  return size === undefined ? undefined : pdfHandleFileKey(sheet.location.fileName, size);
}

/**
 * Permission first, then getFile, then the size check.
 * queryPermission (when present) runs first. When the answer is not 'granted', requestPermission({ mode: 'read' }) runs
 * (it needs the click as the gesture, so nothing else is awaited in between). A thrown error or an answer other than 'granted' gives 'denied'.
 * A handle without queryPermission counts as granted. Then getFile():
 * NotAllowedError or SecurityError -> 'denied'; NotFoundError -> 'gone'; any other error -> 'failed'.
 * file.size !== sizeBytes -> 'changed'. Else 'opened' with { file, target: handle }.
 * A value that asFileHandle rejects -> 'gone'.
 */
export async function openStoredHandle(value: unknown, sizeBytes: number): Promise<StoredOpenOutcome> {
  const handle = asFileHandle(value);
  if (handle === undefined) return { kind: 'gone' };
  try {
    if (handle.queryPermission !== undefined) {
      const state = await handle.queryPermission({ mode: 'read' });
      if (state !== 'granted') {
        if (handle.requestPermission === undefined) return { kind: 'denied' };
        if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') return { kind: 'denied' };
      }
    }
  } catch {
    return { kind: 'denied' };
  }
  let file: File;
  try {
    file = await handle.getFile();
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'denied' };
    if (name === 'NotFoundError') return { kind: 'gone' };
    return { kind: 'failed' };
  }
  if (file.size !== sizeBytes) return { kind: 'changed' };
  return { kind: 'opened', opened: { file, target: handle } };
}

/** True for 'gone' and 'changed'. */
export function shouldDeleteHandle(outcome: StoredOpenOutcome): boolean {
  return outcome.kind === 'gone' || outcome.kind === 'changed';
}

/** null for 'opened'. The notice of a failed outcome. */
export function storedOpenNotice(outcome: StoredOpenOutcome, fileName: string): { text: string; error: boolean } | null {
  switch (outcome.kind) {
    case 'opened':
      return null;
    case 'denied':
      return { text: `Could not open ${fileName}. Access was not allowed. Choose the file again.`, error: true };
    case 'changed':
      return { text: `${fileName} is not the same file any more. Choose the file again.`, error: false };
    case 'gone':
    case 'failed':
      return { text: `Could not open ${fileName}. Choose the file again.`, error: false };
  }
}

/** The notice when the picker fails after a stored handle failed (the browser refused the picker). Always error.
 *  denied -> same text as storedOpenNotice denied. Every other failed outcome -> `Could not open ${fileName}. Choose the file again.` with error: true. */
export function pickerBlockedNotice(outcome: StoredOpenOutcome, fileName: string): { text: string; error: true } {
  if (outcome.kind === 'denied') {
    return { text: `Could not open ${fileName}. Access was not allowed. Choose the file again.`, error: true };
  }
  return { text: `Could not open ${fileName}. Choose the file again.`, error: true };
}

/** True when the sheet has a file: the cache has it, or (the key is not ambiguous in the cache and) the key is in storedKeys. False for a sheet without a size. */
export function sheetHasFile(
  cache: { has(sheet: BuildingSheet): boolean; isAmbiguous(sheet: BuildingSheet): boolean },
  storedKeys: ReadonlySet<string>,
  sheet: BuildingSheet,
): boolean {
  const key = sheetFileKey(sheet);
  if (key === undefined) return false;
  if (cache.has(sheet)) return true;
  return !cache.isAmbiguous(sheet) && storedKeys.has(key);
}

/** The keys of the sheets (fileName:size, only sheets with a size). */
export function sheetKeySet(sheets: readonly BuildingSheet[]): Set<string> {
  const keys = new Set<string>();
  for (const sheet of sheets) {
    const key = sheetFileKey(sheet);
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

/** Keys that are in previous and not in next. */
export function removedKeys(previous: ReadonlySet<string>, next: ReadonlySet<string>): string[] {
  return Array.from(previous).filter((key) => !next.has(key));
}
