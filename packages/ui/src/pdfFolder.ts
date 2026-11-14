import { pdfHandleFileKey } from '@mepapp/platform';
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
        if (!sizes.has(file.size)) continue;
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
  return { matches, ambiguousKeys, capped, scanned: Math.min(scanned, maxItems) };
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

export interface AllowButtonView {
  label: string;
  ariaLabel: string;
  tooltip: string | undefined;
  /** True when the click opens the folder picker. False when it asks the permission for the stored folder. */
  picks: boolean;
  disabled: boolean;
}

export interface BandView {
  hint: string;
  /** Null in a browser that cannot save PDFs: the band is the T01 band then. */
  allow: AllowButtonView | null;
  reconnectDisabled: boolean;
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
}

const ALLOW_ARIA = 'Allow access to the PDF folder';
const PICK_TOOLTIP =
  'Choose the folder with the PDFs of this building. The app finds the sheets in it by file name and size. The app only reads the files.';

function needSentence(count: number): string {
  return count === 1 ? '1 PDF needs a file before it opens.' : `${count} PDFs need a file before they open.`;
}

function allowView(picks: boolean, tooltip: string): AllowButtonView {
  return { label: picks ? `${ALLOW_ARIA}…` : ALLOW_ARIA, ariaLabel: ALLOW_ARIA, tooltip, picks, disabled: false };
}

/** The band of the Sheets section: the hint and the buttons of the state (UX spec B6-T03/T04 section 5 and 7). Null when the band is hidden. */
export function bandView(input: BandInput): BandView | null {
  const { canStore, checked, busy, folderName, folderAccess, savedNeedAllow: saved, needFile: need } = input;
  if (!canStore) {
    return need >= 1 ? { hint: reconnectHint(need), allow: null, reconnectDisabled: false } : null;
  }
  if (!checked) return null;
  if (busy) {
    return {
      hint: `Looking for PDFs in ${folderName ?? 'the folder'}…`,
      allow: { label: 'Looking for PDFs…', ariaLabel: ALLOW_ARIA, tooltip: undefined, picks: false, disabled: true },
      reconnectDisabled: true,
    };
  }
  if (saved === 0 && need === 0) return null;
  if (folderName === null) {
    if (saved >= 1) {
      const first =
        saved === 1
          ? '1 PDF is saved in this browser. Allow access to its folder once to open it.'
          : `${saved} PDFs are saved in this browser. Allow access to their folder once to open them all.`;
      return { hint: need >= 1 ? `${first} ${needSentence(need)}` : first, allow: allowView(true, PICK_TOOLTIP), reconnectDisabled: false };
    }
    const hint =
      need === 1
        ? '1 PDF needs a file before it opens. Choose the file, or allow access to the PDF folder once.'
        : `${need} PDFs need a file before they open. Choose the files, or allow access to the PDF folder once.`;
    return { hint, allow: allowView(true, PICK_TOOLTIP), reconnectDisabled: false };
  }
  if (folderAccess === 'prompt' && saved >= 1) {
    const first =
      saved === 1
        ? `1 PDF is saved in this browser. Allow access to the folder ${folderName} once to open it.`
        : `${saved} PDFs are saved in this browser. Allow access to the folder ${folderName} once to open them.`;
    const tooltip = `The app opens the PDFs of this building from the folder ${folderName}. The browser asks you once. The app only reads the files.`;
    return { hint: need >= 1 ? `${first} ${needSentence(need)}` : first, allow: allowView(false, tooltip), reconnectDisabled: false };
  }
  if (need === 0) return null;
  const hint =
    need === 1
      ? `1 PDF is not in the folder ${folderName}. Choose the file, or allow access to another folder.`
      : `${need} PDFs are not in the folder ${folderName}. Choose the files, or allow access to another folder.`;
  return { hint, allow: allowView(true, `Choose another folder. The app uses it instead of ${folderName}.`), reconnectDisabled: false };
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
}

/** The notice after a folder search. Parts join with one space: found, missing, two files, too many items. Null when nothing was looked for. */
export function folderResultNotice(input: FolderResultInput): FolderNotice | null {
  const { folderName, needed, foundKeys, ambiguousKeys, capped } = input;
  const total = needed.length;
  if (total === 0) return null;
  const keyOf = (need: PdfNeed) => pdfHandleFileKey(need.fileName, need.sizeBytes);
  const isFound = (need: PdfNeed) => foundKeys.has(keyOf(need)) && !ambiguousKeys.has(keyOf(need));
  const found = needed.filter(isFound).length;
  const parts: string[] = [];
  if (found === total) parts.push(total === 1 ? `Found the PDF in ${folderName}.` : `Found all ${total} PDFs in ${folderName}.`);
  else parts.push(`Found ${found} of ${total} PDF${total === 1 ? '' : 's'} in ${folderName}.`);
  if (found === 0) {
    parts.push('The app looked in the folder and in the folders inside it, 3 levels deep.');
  }
  if (found < total) {
    const missing = [...new Set(needed.filter((need) => !isFound(need)).map((need) => need.fileName))];
    parts.push(`Missing: ${namesList(missing)}.`);
  }
  const twoFiles = [...new Set(needed.filter((need) => ambiguousKeys.has(keyOf(need))).map((need) => need.fileName))];
  if (twoFiles.length > 0) {
    parts.push(
      `For ${twoFiles.join(', ')} the folder has two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.`,
    );
  }
  if (capped && found < total) {
    parts.push(`The app stopped looking after ${FOLDER_MAX_ITEMS} items in ${folderName}. Choose a folder that holds fewer files.`);
  }
  return { text: parts.join(' '), error: found === 0 || (capped && found < total) };
}

export function folderDeniedNotice(): FolderNotice {
  return { text: 'Access was not allowed. Click Allow access to try again, or choose the files.', error: true };
}

export function folderGoneNotice(folderName: string): FolderNotice {
  return { text: `The folder ${folderName} is not there any more. Allow access to the PDF folder again.`, error: true };
}

export function folderReadFailedNotice(folderName: string, message: string): FolderNotice {
  return { text: `Could not read the folder ${folderName}: ${message}`, error: true };
}
