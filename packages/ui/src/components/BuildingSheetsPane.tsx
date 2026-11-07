import { useEffect, useRef, useState } from 'react';
import type { BuildingFile } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess, OpenedFile } from '@mepapp/platform';
import { BUILDING_PDF_TYPES, joinFolderPath, pathOfTarget, readPdfInfo } from '../buildingPdfInfo.js';
import {
  addResultText,
  groupPdfs,
  isSamePdf,
  pdfGroupKey,
  pdfTotals,
  placeEntriesOnLevel,
  waitingGroups,
  type PdfGroup,
  type PendingPdf,
} from '../buildingSheets.js';

export interface PendingPdfsState {
  pending: PendingPdf[];
  /** The pending PDFs that still have pages with no level, rows filtered to those pages. */
  waiting: PdfGroup[];
  /** The pages with no level over all waiting PDFs. */
  waitingPages: number;
  /** PDFs, pages and assigned pages over all added PDFs, also the pages that already have a level. */
  totals: { pdfs: number; pages: number; assigned: number };
  remove: (key: string) => void;
}

/**
 * The PDFs that the user added from disk and that wait for a level. They live in this dialog only, not in the building file.
 * A PDF leaves the list when every page of it is a sheet. The list is empty again when another building file opens.
 */
export function usePendingPdfs(file: BuildingFile | null): PendingPdfsState {
  const [pending, setPending] = useState<PendingPdf[]>([]);
  const fileId = file?.id ?? null;

  useEffect(() => {
    setPending([]);
  }, [fileId]);

  const groups = file === null ? [] : groupPdfs(file, pending);
  const waiting = file === null ? [] : waitingGroups(file, pending);
  const waitingPages = waiting.reduce((n, group) => n + group.rows.length, 0);

  useEffect(() => {
    const full = new Set(groups.filter((group) => group.pending && !group.rows.some((row) => row.sheet === null)).map((group) => group.key));
    if (full.size === 0) return;
    setPending((list) => {
      const next = list.filter((pdf) => !full.has(pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName)));
      return next.length === list.length ? list : next;
    });
  }, [file, pending]);

  return {
    pending,
    waiting,
    waitingPages,
    totals: pdfTotals(groups.filter((group) => group.pending)),
    remove: (key) => setPending((list) => list.filter((pdf) => pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName) !== key)),
  };
}

export interface BuildingSheetsPaneProps {
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  /** The selected level. Null or unknown: the add buttons are hidden. */
  levelId: string | null;
  onRefreshStatus: () => void;
  onNotice: (text: string, error: boolean) => void;
  onFilesRead?: (opened: OpenedFile[]) => void;
}

/**
 * The action row that adds PDFs from disk to the selected level: "Add PDFs…" (one or more files) and "Add folder…" (desktop only).
 * The pages go to that level at once. The result text stays below the row until the next add, a dismiss or a level change.
 */
export function BuildingSheetsPane({ fileAccess, engine, file, update, levelId, onRefreshStatus, onNotice, onFilesRead }: BuildingSheetsPaneProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean; levelId: string | null } | null>(null);
  const levelSelected = file.levels.some((item) => item.id === levelId);
  /** False after the building changed (the dialog keys this pane by building). A read that ends later must not add its PDFs. */
  const mountedRef = useRef(true);
  const addRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  /** The button that started a read. The button is disabled while the read runs, so the focus is restored to it after. */
  const restoreRef = useRef<'add' | 'folder' | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    onRefreshStatus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (busy || restoreRef.current === null) return;
    if (!document.activeElement || document.activeElement === document.body) {
      (restoreRef.current === 'add' ? addRef : folderRef).current?.focus();
    }
    restoreRef.current = null;
  }, [busy]);

  useEffect(() => {
    setResult(null);
  }, [levelId]);

  const noEngineReason = engine === undefined ? 'PDF reading is not available in this version of the app.' : undefined;
  const disabled = busy || engine === undefined;

  function notify(text: string, error?: boolean) {
    setResult({ text, error: error === true || text.startsWith('Could not'), levelId });
  }

  async function addFile() {
    setResult(null);
    const level = levelId === null ? undefined : file.levels.find((item) => item.id === levelId);
    const opened = await fileAccess.openFiles(BUILDING_PDF_TYPES).catch((err: unknown) => {
      notify(`Could not open the file picker: ${(err as Error).message}`);
      return null;
    });
    if (opened === null || opened.length === 0) return;
    onFilesRead?.(opened);
    if (engine === undefined || level === undefined) return;
    restoreRef.current = 'add';
    setBusy(true);
    try {
      const entries: PendingPdf[] = [];
      const failed: string[] = [];
      let skippedDuplicates = 0;
      for (const item of opened) {
        if (!mountedRef.current) return;
        let entry: PendingPdf;
        try {
          entry = await readEntry(item.file, pathOfTarget(item.target), engine);
        } catch {
          failed.push(item.file.name);
          continue;
        }
        if (entries.some((other) => isSamePdf(other, entry))) {
          skippedDuplicates += 1;
          continue;
        }
        entries.push(entry);
      }
      if (!mountedRef.current) return;
      let placed = 0;
      let sameLevel = 0;
      let elsewhere: { levelName: string; count: number }[] = [];
      if (entries.length > 0) {
        await update((current) => {
          const outcome = placeEntriesOnLevel(current, entries, level.id);
          placed = outcome.placed;
          sameLevel = outcome.sameLevel;
          elsewhere = outcome.elsewhere;
          return outcome.file;
        });
      }
      if (!mountedRef.current) return;
      notify(addResultText({ levelName: level.name, placed, pdfCount: entries.length, sameLevel, elsewhere, skippedDuplicates, failed }), placed === 0 && failed.length > 0);
    } catch (err) {
      if (!mountedRef.current) return;
      notify(`Could not add PDFs: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function addFolder() {
    setResult(null);
    const level = levelId === null ? undefined : file.levels.find((item) => item.id === levelId);
    const picked = await fileAccess.pickFolder().catch((err: unknown) => {
      notify(`Could not open the file picker: ${(err as Error).message}`);
      return null;
    });
    if (picked === null || picked === undefined || engine === undefined || level === undefined) return;
    restoreRef.current = 'folder';
    setBusy(true);
    try {
      const files = await fileAccess.readFolder(picked.folder, ['pdf']);
      if (!mountedRef.current) return;
      if (files.length === 0) {
        notify(`No PDF files in ${picked.name}.`);
        return;
      }
      onFilesRead?.(files.map((file) => ({ file })));
      const added: PendingPdf[] = [];
      const failed: string[] = [];
      let skippedDuplicates = 0;
      for (const item of files) {
        if (!mountedRef.current) return;
        const path = 'folderPath' in picked.folder ? joinFolderPath(picked.folder.folderPath, item.name) : undefined;
        let entry: PendingPdf;
        try {
          entry = await readEntry(item, path, engine);
        } catch {
          failed.push(item.name);
          continue;
        }
        if (added.some((other) => isSamePdf(other, entry))) {
          skippedDuplicates += 1;
          continue;
        }
        added.push(entry);
      }
      if (!mountedRef.current) return;
      let placed = 0;
      let sameLevel = 0;
      let elsewhere: { levelName: string; count: number }[] = [];
      if (added.length > 0) {
        await update((current) => {
          const outcome = placeEntriesOnLevel(current, added, level.id);
          placed = outcome.placed;
          sameLevel = outcome.sameLevel;
          elsewhere = outcome.elsewhere;
          return outcome.file;
        });
      }
      if (!mountedRef.current) return;
      notify(
        addResultText({
          levelName: level.name,
          placed,
          pdfCount: added.length,
          sameLevel,
          elsewhere,
          source: picked.name,
          skippedDuplicates,
          failed,
        }),
        placed === 0 && failed.length > 0,
      );
    } catch (err) {
      notify(`Could not add PDFs: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mep-buildings-actions" data-testid="add-actions">
        {levelSelected && (
          <button ref={addRef} type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFile()}>
            Add PDFs…
          </button>
        )}
        {levelSelected && fileAccess.capabilities.folders && (
          <button ref={folderRef} type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFolder()}>
            Add folder…
          </button>
        )}
        <button
          type="button"
          className="mep-icon-btn"
          data-testid="refresh-status"
          aria-label="Refresh"
          title="Check the files again"
          onClick={() => onRefreshStatus()}
        >
          ↻
        </button>
        {busy && (
          <span className="mep-hint" data-testid="sheets-busy">
            Reading PDFs…
          </span>
        )}
        {!levelSelected && file.levels.length > 0 && (
          <p className="mep-hint" data-testid="add-hint">
            Select a level to add PDFs.
          </p>
        )}
      </div>
      {result !== null && result.levelId === levelId && (
        <div className={`mep-add-result${result.error ? ' mep-add-result--error' : ''}`} role="status" data-testid="add-result">
          <span>{result.text}</span>
          <button type="button" className="mep-icon-btn" aria-label="Dismiss" data-testid="add-result-dismiss" onClick={() => setResult(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}

/** Reads one PDF into a PendingPdf. Throws the engine error when the file cannot be read as a PDF. */
async function readEntry(file: File, path: string | undefined, engine: PdfEngine): Promise<PendingPdf> {
  const info = await readPdfInfo(file, engine);
  return {
    fileName: file.name,
    path,
    sizeBytes: file.size,
    pageCount: info.pageCount,
    projectUuid: info.projectUuid,
  };
}
