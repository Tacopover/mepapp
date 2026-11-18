import { pdfHandleFileKey } from '@mepapp/platform';
import { twoChangedText } from './changedFile.js';
import { reconnectHint, type PdfNeed } from './reconnectPdfs.js';

/** The id of the folder picker. Chrome remembers the last folder for each id. Not the id of the stamp library. */
export const FOLDER_PICKER_ID = 'mepapp-building-pdfs';
/** The search goes into the folder and into the folders inside it, 3 levels deep (D-B-67). */
export const FOLDER_MAX_DEPTH = 3;
/** The search stops after this many items (files and folders) (provisional). */
export const FOLDER_MAX_ITEMS = 5000;

/** The part of a FileSystemDirectoryHandle or FileSystemFileHandle that the search uses. */
export interface FolderEntry {
  kind: string;
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<FolderEntry>;
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<string>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<string>;
}

export interface WantedPdf {
  fileName: string;
  sizeBytes: number;
}

export interface FolderMatch {
  key: string;
  file: File;
  handle: FolderEntry;
}

export interface FolderScanResult {
  /** One match for each file with the name and size of a wanted PDF. Files that are the same (same name, size, time stamp) count once. */
  matches: FolderMatch[];
  /** Keys with two different files (different time stamps) under one name and size. */
  ambiguousKeys: string[];
  /** One candidate for each file name with a changed file (same name, another size than every sheet). Never a name that has an exact match. */
  changed: FolderMatch[];
  /** File names with two different changed files (different size or time stamp). Not in `changed`. */
  changedAmbiguousNames: string[];
  /** True when the search stopped at the item limit. */
  capped: boolean;
  scanned: number;
}

/** The value when it is a folder handle (has values()), else undefined. */
export function asFolderHandle(value: unknown): FolderEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { values?: unknown };
  return typeof candidate.values === 'function' ? (value as FolderEntry) : undefined;
}

/**
 * Looks for the wanted PDFs in a folder, shallow folders first. A match has the same file name and the same size.
 * The root folder is level 0. Folders down to level `maxDepth` are searched. After `maxItems` items the search stops (capped).
 * An error at the root folder is thrown. An error inside a folder inside it skips that folder. A file that cannot be read is skipped.
 */
export async function scanPdfFolder(
  root: FolderEntry,
  wanted: readonly WantedPdf[],
  limits: { maxDepth?: number; maxItems?: number } = {},
): Promise<FolderScanResult> {
  const maxDepth = limits.maxDepth ?? FOLDER_MAX_DEPTH;
  const maxItems = limits.maxItems ?? FOLDER_MAX_ITEMS;
  const sizesByName = new Map<string, Set<number>>();
  for (const pdf of wanted) {
    const sizes = sizesByName.get(pdf.fileName) ?? new Set<number>();
    sizes.add(pdf.sizeBytes);
    sizesByName.set(pdf.fileName, sizes);
  }
  const found = new Map<string, FolderMatch[]>();
  const candidates = new Map<string, FolderMatch[]>();
  const exactNames = new Set<string>();
  let scanned = 0;
  let capped = false;
  const queue: { dir: FolderEntry; depth: number }[] = [{ dir: root, depth: 0 }];
  for (let next = 0; next < queue.length && !capped; next++) {
    const { dir, depth } = queue[next]!;
    try {
      for await (const entry of dir.values!()) {
        scanned += 1;
        if (scanned > maxItems) {
          capped = true;
          break;
        }
        if (entry.kind === 'directory') {
          if (depth < maxDepth) queue.push({ dir: entry, depth: depth + 1 });
          continue;
        }
        const sizes = sizesByName.get(entry.name);
        if (entry.kind !== 'file' || sizes === undefined || entry.getFile === undefined) continue;
        let file: File;
        try {
          file = await entry.getFile();
        } catch {
          continue;
        }
        if (!sizes.has(file.size)) {
          const list = candidates.get(entry.name) ?? [];
          if (!list.some((match) => match.file.size === file.size && match.file.lastModified === file.lastModified)) {
            list.push({ key: pdfHandleFileKey(entry.name, file.size), file, handle: entry });
          }
          candidates.set(entry.name, list);
          continue;
        }
        exactNames.add(entry.name);
        const key = pdfHandleFileKey(entry.name, file.size);
        const list = found.get(key) ?? [];
        if (!list.some((match) => match.file.lastModified === file.lastModified)) list.push({ key, file, handle: entry });
        found.set(key, list);
      }
    } catch (error) {
      if (depth === 0) throw error;
    }
  }
  const matches: FolderMatch[] = [];
  const ambiguousKeys: string[] = [];
  for (const [key, list] of found) {
    matches.push(...list);
    if (list.length > 1) ambiguousKeys.push(key);
  }
  const changed: FolderMatch[] = [];
  const changedAmbiguousNames: string[] = [];
  for (const [name, list] of candidates) {
    if (exactNames.has(name)) continue;
    if (list.length === 1) changed.push(list[0]!);
    else if (list.length > 1) changedAmbiguousNames.push(name);
  }
  return { matches, ambiguousKeys, changed, changedAmbiguousNames, capped, scanned: Math.min(scanned, maxItems) };
}

/** How a failed read of the folder is told: the user did not allow, the folder is not there, or another error. */
export function folderErrorKind(error: unknown): 'denied' | 'gone' | 'failed' {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError') return 'gone';
  return 'failed';
}

export type FolderAccess = 'granted' | 'prompt';

/**
 * Asks the permission for the folder (mode read). The click must still be the gesture, so nothing slow runs before.
 * 'granted' when the folder is readable now. 'denied' when the user did not allow or the browser throws.
 */
export async function ensureFolderAccess(folder: FolderEntry): Promise<'granted' | 'denied'> {
  try {
    if (folder.queryPermission !== undefined && (await folder.queryPermission({ mode: 'read' })) === 'granted') return 'granted';
    if (folder.requestPermission === undefined) return folder.queryPermission === undefined ? 'granted' : 'denied';
    return (await folder.requestPermission({ mode: 'read' })) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export type ReconnectMenuAction = 'pick' | 'use' | 'files';

export interface ReconnectMenuItem {
  /** 'pick' opens the folder picker, 'use' asks the permission for the stored folder, 'files' opens the file picker. */
  action: ReconnectMenuAction;
  label: string;
  help: string;
  testId: 'pdf-folder-pick' | 'pdf-folder-use' | 'pdf-files-pick';
}

export interface BandView {
  hint: string;
  /** Null: the button opens the file picker at once (Firefox, Safari) or is off (busy). */
  menu: ReconnectMenuItem[] | null;
  reconnectDisabled: boolean;
  /** True when the button has a menu (Chrome and Edge, not busy). */
  hasMenu: boolean;
}

export interface BandInput {
  /** The browser keeps PDF handles (Chrome and Edge). */
  canStore: boolean;
  /** The first access check of the building has ended. */
  checked: boolean;
  busy: boolean;
  folderName: string | null;
  /** The permission of the stored folder now. Ignored without a folder. */
  folderAccess: FolderAccess;
  /** P: PDFs of the building that have a saved file and need a permission. */
  savedNeedAllow: number;
  /** N: PDFs of the shown scope that have no file and no saved file. */
  needFile: number;
  /** K: PDFs known as changed in this tab (T06). */
  changedPdfs: number;
}

function needSentence(count: number): string {
  return count === 1 ? '1 PDF needs a file before it opens.' : `${count} PDFs need a file before they open.`;
}

function changedHint(count: number): string | null {
  return count >= 2 ? `${count} PDFs changed after they were added. Click Reconnect PDFs… and choose the new files.` : null;
}

const FILES_ITEM: ReconnectMenuItem = {
  action: 'files',
  label: 'Choose files…',
  help: 'Pick the PDF files yourself. Press Ctrl+A in the picker to pick all.',
  testId: 'pdf-files-pick',
};

function menuOf(folderName: string | null, folderAccess: FolderAccess): ReconnectMenuItem[] {
  if (folderName === null) {
    return [
      {
        action: 'pick',
        label: 'Choose a folder…',
        help: 'The app finds the PDFs of this building in the folder and the folders inside it.',
        testId: 'pdf-folder-pick',
      },
      FILES_ITEM,
    ];
  }
  const use: ReconnectMenuItem =
    folderAccess === 'prompt'
      ? { action: 'use', label: `Use the folder ${folderName}`, help: 'The browser asks you once to allow access.', testId: 'pdf-folder-use' }
      : {
          action: 'use',
          label: `Look in ${folderName} again`,
          help: 'The app searches the folder and the folders inside it again.',
          testId: 'pdf-folder-use',
        };
  const pick: ReconnectMenuItem = {
    action: 'pick',
    label: 'Choose another folder…',
    help: `The app uses it instead of ${folderName}.`,
    testId: 'pdf-folder-pick',
  };
  return [use, pick, FILES_ITEM];
}

/** The band of the Sheets section: the hint and the button of the state (UX spec B6-T06/T08 section 6.2). Null when the band is hidden. */
export function bandView(input: BandInput): BandView | null {
  const { canStore, checked, busy, folderName, folderAccess, savedNeedAllow: saved, needFile: need, changedPdfs } = input;
  if (!canStore) {
    const hint = need >= 1 ? reconnectHint(need) : changedHint(changedPdfs);
    return hint === null ? null : { hint, menu: null, reconnectDisabled: false, hasMenu: false };
  }
  if (!checked) return null;
  if (busy) {
    return { hint: `Looking for PDFs in ${folderName ?? 'the folder'}…`, menu: null, reconnectDisabled: true, hasMenu: false };
  }
  const menu = menuOf(folderName, folderAccess);
  const view = (hint: string | null): BandView | null => (hint === null ? null : { hint, menu, reconnectDisabled: false, hasMenu: true });
  const withNeed = (first: string): string => (need >= 1 ? `${first} ${needSentence(need)}` : first);
  if (saved === 0 && need === 0) return view(changedHint(changedPdfs));
  if (folderName === null) {
    if (saved >= 1) {
      return view(
        withNeed(
          saved === 1
            ? '1 PDF is saved in this browser. Click Reconnect PDFs… to open it.'
            : `${saved} PDFs are saved in this browser. Click Reconnect PDFs… to open them all.`,
        ),
      );
    }
    return view(
      need === 1
        ? '1 PDF needs a file before it opens. Click Reconnect PDFs… to choose the folder or the file.'
        : `${need} PDFs need a file before they open. Click Reconnect PDFs… to choose the folder or the files.`,
    );
  }
  if (folderAccess === 'prompt' && saved >= 1) {
    return view(
      withNeed(
        saved === 1
          ? `1 PDF is saved in this browser. Click Reconnect PDFs… and use the folder ${folderName} to open it.`
          : `${saved} PDFs are saved in this browser. Click Reconnect PDFs… and use the folder ${folderName} to open them.`,
      ),
    );
  }
  if (need === 0) return view(changedHint(changedPdfs));
  return view(
    need === 1
      ? `1 PDF is not in the folder ${folderName}. Click Reconnect PDFs… to choose the file or another folder.`
      : `${need} PDFs are not in the folder ${folderName}. Click Reconnect PDFs… to choose the files or another folder.`,
  );
}

function namesList(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export interface FolderNotice {
  text: string;
  error: boolean;
}

export interface FolderResultInput {
  folderName: string;
  /** The PDFs that the action looked for (T01 rule of the scope). */
  needed: PdfNeed[];
  /** Keys of the files that the search found. */
  foundKeys: ReadonlySet<string>;
  ambiguousKeys: ReadonlySet<string>;
  capped: boolean;
  /** File names with a changed file in the folder. */
  changedNames?: ReadonlySet<string>;
  /** 'found': a needed PDF with a name in changedNames counts as found. 'excluded': it is left out of the counts. */
  changedMode?: 'found' | 'excluded';
  /** File names with two different changed files. */
  changedAmbiguousNames?: string[];
}

/** The notice after a folder search. Parts join with one space: found, missing, two files, two changed files, too many items. Null when nothing was looked for. */
export function folderResultNotice(input: FolderResultInput): FolderNotice | null {
  const { folderName, foundKeys, ambiguousKeys, capped, changedNames, changedMode, changedAmbiguousNames } = input;
  const isChanged = (need: PdfNeed) => changedNames?.has(need.fileName) === true;
  const needed = input.needed;
  const total = needed.length;
  const held = (need: PdfNeed) => changedMode === 'excluded' && isChanged(need);
  const others = needed.filter((need) => !held(need)).length;
  if (others === 0) return null;
  const keyOf = (need: PdfNeed) => pdfHandleFileKey(need.fileName, need.sizeBytes);
  const isFound = (need: PdfNeed) =>
    (changedMode === 'found' && isChanged(need)) || (!held(need) && foundKeys.has(keyOf(need)) && !ambiguousKeys.has(keyOf(need)));
  const found = needed.filter(isFound).length;
  const lacking = others - found;
  const parts: string[] = [];
  if (found === total) parts.push(total === 1 ? `Found the PDF in ${folderName}.` : `Found all ${total} PDFs in ${folderName}.`);
  else parts.push(`Found ${found} of ${total} PDF${total === 1 ? '' : 's'} in ${folderName}.`);
  if (found === 0) {
    parts.push('The app looked in the folder and in the folders inside it, 3 levels deep.');
  }
  if (lacking > 0) {
    const missing = [...new Set(needed.filter((need) => !isFound(need) && !held(need)).map((need) => need.fileName))];
    parts.push(`Missing: ${namesList(missing)}.`);
  }
  const twoFiles = [...new Set(needed.filter((need) => !held(need) && ambiguousKeys.has(keyOf(need))).map((need) => need.fileName))];
  if (twoFiles.length > 0) {
    parts.push(
      `For ${twoFiles.join(', ')} the folder has two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.`,
    );
  }
  if (changedAmbiguousNames !== undefined && changedAmbiguousNames.length > 0) {
    parts.push(twoChangedText(changedAmbiguousNames, 'folder'));
  }
  if (capped && lacking > 0) {
    parts.push(`The app stopped looking after ${FOLDER_MAX_ITEMS} items in ${folderName}. Choose a folder that holds fewer files.`);
  }
  return { text: parts.join(' '), error: found === 0 || (capped && lacking > 0) };
}

export function folderDeniedNotice(): FolderNotice {
  return {
    text: 'Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser.',
    error: true,
  };
}

export function folderGoneNotice(folderName: string): FolderNotice {
  return { text: `The folder ${folderName} is not there any more. Click Reconnect PDFs… and choose the folder again.`, error: true };
}

export function folderReadFailedNotice(folderName: string, message: string): FolderNotice {
  return { text: `Could not read the folder ${folderName}: ${message}`, error: true };
}
