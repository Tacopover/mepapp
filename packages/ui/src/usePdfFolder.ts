import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingSheet } from '@mepapp/core';
import type { FileAccess, FileTarget, OpenedFile, PdfHandleStore } from '@mepapp/platform';
import { pdfHandleFileKey } from '@mepapp/platform';
import { asFileHandle, sheetFileKey } from './pdfHandles.js';
import {
  FOLDER_PICKER_ID,
  asFolderHandle,
  ensureFolderAccess,
  folderDeniedNotice,
  folderErrorKind,
  folderGoneNotice,
  folderReadFailedNotice,
  folderResultNotice,
  scanPdfFolder,
  type FolderAccess,
  type FolderEntry,
  type FolderMatch,
  type FolderNotice,
  type WantedPdf,
} from './pdfFolder.js';
import { pdfsNeedingFile } from './reconnectPdfs.js';
import type { SheetFileCache } from './sheetFileCache.js';

/** What the band of the Sheets section needs to know about the PDF folder of the open building. */
export interface PdfFolderState {
  /** The first access check of the building has ended. */
  checked: boolean;
  /** A search in the folder runs now. */
  busy: boolean;
  folderName: string | null;
  folderAccess: FolderAccess;
  /** P: PDFs of the building with a saved file that need a permission. */
  savedNeedAllow: number;
}

export interface PdfFolderControl {
  state: PdfFolderState;
  /**
   * The click on the band button. pick = true opens the folder picker and stores the folder.
   * pick = false asks the permission for the stored folder. Then the folder is searched.
   * `scope` lists the sheets that the notice counts. Resolves with the notice, or null when the user cancelled.
   */
  allow(options: { pick: boolean; scope: readonly BuildingSheet[] }): Promise<AllowOutcome>;
}

/** The changed files that a folder search found (same name as a sheet, another size). The files are not remembered. */
export interface ChangedScan {
  files: OpenedFile[];
  /** File names with two different changed files. The app uses neither. */
  ambiguousNames: string[];
  /** The notice of the search with the changed PDFs counted as found, or left out. */
  /** `names`: the changed file names that the mode applies to. Default: every changed file of the search. */
  noticeFor: (mode: 'found' | 'excluded', names?: ReadonlySet<string>) => FolderNotice | null;
}

export interface AllowOutcome {
  /** The notice of the search with no change for changed files. Null when the user cancelled or nothing was looked for. */
  notice: FolderNotice | null;
  /** Null when the search found no changed file. */
  changed: ChangedScan | null;
}

export interface FolderOpenResult {
  /** The file of the sheet, when the folder had it. */
  opened?: OpenedFile;
  /** A changed file of the sheet (same name, another size), when the folder had no exact file. */
  changed?: OpenedFile;
  /** The result of the search, or the reason that the folder could not be used. */
  notice?: FolderNotice;
  /** True when the user did not allow access to the folder. */
  denied?: boolean;
  /** True when the building changed during the action. The caller stops silently. */
  stale?: boolean;
}

export interface UsePdfFolderInput {
  store: PdfHandleStore | undefined;
  /** The browser keeps PDF handles and the app is not the desktop app. */
  enabled: boolean;
  buildingId: string | null;
  /** All sheets of the open building. */
  sheets: readonly BuildingSheet[];
  fileAccess: FileAccess;
  cache: SheetFileCache;
  hasStoredKey: (key: string) => boolean;
  /** Gives a found file to the tab memory, and (when the key is not ambiguous) to the handle store. */
  rememberMatch: (match: FolderMatch, ambiguous: boolean) => void;
  /** A number that grows when the tab memory or the stored keys change. */
  version: number;
}

type ScanOutcome = { kind: 'done' | 'gone' | 'denied' | 'failed'; notice: FolderNotice | null; changed: ChangedScan | null } | { kind: 'stale' };

interface FolderMemory {
  handle: FolderEntry | null;
  name: string | null;
  access: FolderAccess;
}

const EMPTY_FOLDER: FolderMemory = { handle: null, name: null, access: 'prompt' };

async function queryAccess(handle: { queryPermission?: (descriptor: { mode: 'read' }) => Promise<string> }): Promise<FolderAccess> {
  if (handle.queryPermission === undefined) return 'granted';
  try {
    return (await handle.queryPermission({ mode: 'read' })) === 'granted' ? 'granted' : 'prompt';
  } catch {
    return 'prompt';
  }
}

function wantedPdfs(sheets: readonly BuildingSheet[]): WantedPdf[] {
  const seen = new Set<string>();
  const wanted: WantedPdf[] = [];
  for (const sheet of sheets) {
    const key = sheetFileKey(sheet);
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    wanted.push({ fileName: sheet.location.fileName, sizeBytes: sheet.location.sizeBytes! });
  }
  return wanted;
}

/**
 * One folder for the PDFs of a building (Chrome and Edge). The folder handle is stored per building.
 * One permission for the folder opens every PDF in it. The search finds the files by file name and size.
 */
export function usePdfFolder(input: UsePdfFolderInput): { control: PdfFolderControl | undefined; openViaFolder: (sheet: BuildingSheet) => Promise<FolderOpenResult | undefined> } {
  const { store, enabled, buildingId, sheets, fileAccess, cache, hasStoredKey, rememberMatch, version } = input;
  const folderRef = useRef<FolderMemory>(EMPTY_FOLDER);
  const fileGrantedRef = useRef(new Set<string>());
  const checkedRef = useRef(false);
  const busyRef = useRef(false);
  const missesRef = useRef(new Set<string>());
  const deniedRef = useRef(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const idRef = useRef(buildingId);
  idRef.current = buildingId;
  const sheetsRef = useRef(sheets);
  sheetsRef.current = sheets;
  const storedRef = useRef(hasStoredKey);
  storedRef.current = hasStoredKey;
  const rememberRef = useRef(rememberMatch);
  rememberRef.current = rememberMatch;

  const runScan = useCallback(
    async (id: string, dir: FolderEntry, scope: readonly BuildingSheet[] | null): Promise<ScanOutcome> => {
      const name = folderRef.current.name ?? dir.name;
      const all = sheetsRef.current;
      // The notice counts every PDF of the scope. A PDF that this tab holds already counts as found.
      const needed = pdfsNeedingFile([...(scope ?? all)], () => false);
      busyRef.current = true;
      refresh();
      try {
        let result;
        try {
          result = await scanPdfFolder(dir, wantedPdfs(all));
        } catch (error) {
          if (idRef.current !== id) return { kind: 'stale' };
          const kind = folderErrorKind(error);
          if (kind === 'gone') {
            folderRef.current = EMPTY_FOLDER;
            void store?.deleteFolder(id);
            return { kind, notice: folderGoneNotice(name), changed: null };
          }
          if (kind === 'denied') {
            folderRef.current = { ...folderRef.current, access: 'prompt' };
            return { kind, notice: folderDeniedNotice(), changed: null };
          }
          return { kind, notice: folderReadFailedNotice(name, (error as Error | null)?.message ?? 'unknown error'), changed: null };
        }
        if (idRef.current !== id) return { kind: 'stale' };
        const ambiguous = new Set(result.ambiguousKeys);
        const foundKeys = new Set<string>();
        const noticeKeys = new Set<string>();
        for (const need of needed) if (cache.has(need.sheet)) noticeKeys.add(pdfHandleFileKey(need.fileName, need.sizeBytes));
        for (const match of result.matches) {
          rememberRef.current(match, ambiguous.has(match.key));
          foundKeys.add(match.key);
          noticeKeys.add(match.key);
        }
        for (const pdf of wantedPdfs(all)) {
          const key = pdfHandleFileKey(pdf.fileName, pdf.sizeBytes);
          if (foundKeys.has(key) && !ambiguous.has(key)) missesRef.current.delete(key);
          else missesRef.current.add(key);
        }
        folderRef.current = { ...folderRef.current, access: 'granted' };
        const notice = folderResultNotice({ folderName: name, needed, foundKeys: noticeKeys, ambiguousKeys: ambiguous, capped: result.capped });
        let changed: ChangedScan | null = null;
        if (result.changed.length > 0 || result.changedAmbiguousNames.length > 0) {
          const changedNames = new Set(result.changed.map((match) => match.file.name));
          const changedAmbiguousNames = result.changedAmbiguousNames;
          changed = {
            files: result.changed.map((match) => ({ file: match.file, target: match.handle as unknown as FileTarget })),
            ambiguousNames: changedAmbiguousNames,
            noticeFor: (mode, names) =>
              folderResultNotice({
                folderName: name,
                needed,
                foundKeys: noticeKeys,
                ambiguousKeys: ambiguous,
                capped: result.capped,
                changedNames: names ?? changedNames,
                changedMode: mode,
                changedAmbiguousNames,
              }),
          };
        }
        return { kind: 'done', notice, changed };
      } finally {
        if (idRef.current === id) busyRef.current = false;
        refresh();
      }
    },
    [cache, refresh, store],
  );

  // The access check of the building: the folder permission and the permission of each saved file. A folder that is readable now is searched at once.
  useEffect(() => {
    folderRef.current = EMPTY_FOLDER;
    fileGrantedRef.current = new Set();
    checkedRef.current = false;
    busyRef.current = false;
    missesRef.current = new Set();
    deniedRef.current = false;
    refresh();
    if (!enabled || store === undefined || buildingId === null) return;
    let cancelled = false;
    void (async () => {
      const folder = asFolderHandle(await store.getFolder(buildingId));
      const access = folder === undefined ? 'prompt' : await queryAccess(folder);
      const granted = new Set<string>();
      if (access !== 'granted') {
        for (const key of await store.listFiles(buildingId)) {
          const handle = asFileHandle(await store.getFile(buildingId, key));
          if (handle !== undefined && (await queryAccess(handle)) === 'granted') granted.add(key);
        }
      }
      if (cancelled) return;
      folderRef.current = folder === undefined ? EMPTY_FOLDER : { handle: folder, name: folder.name, access };
      fileGrantedRef.current = granted;
      checkedRef.current = true;
      if (folder !== undefined && access === 'granted') void runScan(buildingId, folder, null);
      refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, store, buildingId, refresh, runScan]);

  const allow = useCallback(
    async ({ pick, scope }: { pick: boolean; scope: readonly BuildingSheet[] }): Promise<AllowOutcome> => {
      const none: AllowOutcome = { notice: null, changed: null };
      const id = idRef.current;
      if (id === null || store === undefined) return none;
      deniedRef.current = false;
      let handle: FolderEntry;
      if (pick) {
        let picked;
        try {
          picked = await fileAccess.pickFolder({ id: FOLDER_PICKER_ID });
        } catch (error) {
          return { notice: { text: `Could not open the file picker: ${(error as Error).message}`, error: true }, changed: null };
        }
        if (picked === undefined || idRef.current !== id) return none;
        const chosen = 'dirHandle' in picked.folder ? asFolderHandle(picked.folder.dirHandle) : undefined;
        if (chosen === undefined) return { notice: { text: 'Could not open the file picker: the browser gave no folder.', error: true }, changed: null };
        await store.putFolder(id, chosen);
        if (idRef.current !== id) return none;
        folderRef.current = { handle: chosen, name: chosen.name, access: 'granted' };
        missesRef.current = new Set();
        handle = chosen;
      } else {
        const stored = folderRef.current.handle;
        if (stored === null) return none;
        const verdict = await ensureFolderAccess(stored);
        if (idRef.current !== id) return none;
        if (verdict === 'denied') {
          folderRef.current = { ...folderRef.current, access: 'prompt' };
          refresh();
          return { notice: folderDeniedNotice(), changed: null };
        }
        folderRef.current = { ...folderRef.current, access: 'granted' };
        handle = stored;
      }
      const outcome = await runScan(id, handle, scope);
      return outcome.kind === 'stale' ? none : { notice: outcome.notice, changed: outcome.changed };
    },
    [fileAccess, refresh, runScan, store],
  );

  const openViaFolder = useCallback(
    async (sheet: BuildingSheet): Promise<FolderOpenResult | undefined> => {
      const id = idRef.current;
      const key = sheetFileKey(sheet);
      const folder = folderRef.current;
      if (!enabled || store === undefined || id === null || key === undefined || folder.handle === null) return undefined;
      if (deniedRef.current || missesRef.current.has(key) || cache.isAmbiguous(sheet)) return undefined;
      const handle = folder.handle;
      const verdict = await ensureFolderAccess(handle);
      if (idRef.current !== id) return { stale: true };
      if (verdict === 'denied') {
        deniedRef.current = true;
        folderRef.current = { ...folderRef.current, access: 'prompt' };
        refresh();
        return { notice: folderDeniedNotice(), denied: true };
      }
      folderRef.current = { ...folderRef.current, access: 'granted' };
      const outcome = await runScan(id, handle, null);
      if (outcome.kind === 'stale') return { stale: true };
      const opened = await cache.take(sheet);
      let changed: OpenedFile | undefined;
      if (opened === undefined && outcome.changed !== null && !outcome.changed.ambiguousNames.includes(sheet.location.fileName)) {
        changed = outcome.changed.files.find((candidate) => candidate.file.name === sheet.location.fileName);
      }
      return { opened, changed, notice: outcome.notice ?? undefined, denied: outcome.kind === 'denied' };
    },
    [cache, enabled, refresh, runScan, store],
  );

  const control = useMemo<PdfFolderControl | undefined>(() => {
    if (!enabled) return undefined;
    const folder = folderRef.current;
    const seen = new Set<string>();
    let saved = 0;
    if (folder.access !== 'granted') {
      for (const sheet of sheetsRef.current) {
        const key = sheetFileKey(sheet);
        if (key === undefined || seen.has(key)) continue;
        seen.add(key);
        if (storedRef.current(key) && !cache.has(sheet) && !cache.isAmbiguous(sheet) && !fileGrantedRef.current.has(key)) saved += 1;
      }
    }
    return {
      state: { checked: checkedRef.current, busy: busyRef.current, folderName: folder.name, folderAccess: folder.access, savedNeedAllow: saved },
      allow,
    };
    // tick and version make the state read again; the refs hold the values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, version, sheets, allow, cache]);

  return { control, openViaFolder };
}
