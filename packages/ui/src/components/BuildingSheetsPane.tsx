import { useEffect, useRef, useState } from 'react';
import type { BuildingFile } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { countLabel } from '../buildingLevels.js';
import { BUILDING_PDF_TYPES, joinFolderPath, pathOfTarget, readPdfInfo } from '../buildingPdfInfo.js';
import { groupPdfs, isSamePdf, pdfGroupKey, pdfTotals, waitingGroups, type PdfGroup, type PendingPdf } from '../buildingSheets.js';

export interface PendingPdfsState {
  pending: PendingPdf[];
  /** The pending PDFs that still have pages with no level, rows filtered to those pages. */
  waiting: PdfGroup[];
  /** The pages with no level over all waiting PDFs. */
  waitingPages: number;
  /** PDFs, pages and assigned pages over all added PDFs, also the pages that already have a level. */
  totals: { pdfs: number; pages: number; assigned: number };
  add: (entries: PendingPdf[]) => void;
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
    add: (entries) => setPending((list) => [...list, ...entries.filter((entry) => !list.some((other) => isSamePdf(other, entry)))]),
    remove: (key) => setPending((list) => list.filter((pdf) => pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName) !== key)),
  };
}

export interface BuildingSheetsPaneProps {
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  pendingPdfs: PendingPdfsState;
  onRefreshStatus: () => void;
  /** Called after at least one PDF joined the not placed list. */
  onAdded?: () => void;
  onNotice: (text: string, error: boolean) => void;
}

/**
 * The action row that adds PDFs from disk: "Add PDFs…" (one file at a time) and "Add folder…" (desktop only).
 * The added PDFs wait in the Not placed list (NotPlacedPane).
 */
export function BuildingSheetsPane({ fileAccess, engine, pendingPdfs, onRefreshStatus, onAdded, onNotice }: BuildingSheetsPaneProps) {
  const [busy, setBusy] = useState(false);
  const { pending } = pendingPdfs;
  /** False after the building changed (the dialog keys this pane by building). A read that ends later must not add its PDFs. */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    onRefreshStatus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const noEngineReason = engine === undefined ? 'PDF reading is not available in this version of the app.' : undefined;
  const disabled = busy || engine === undefined;

  function notify(text: string) {
    onNotice(text, text.startsWith('Could not'));
  }

  async function addFile() {
    const opened = await fileAccess.openFile(BUILDING_PDF_TYPES).catch((err: unknown) => {
      notify(`Could not open the file picker: ${(err as Error).message}`);
      return null;
    });
    if (opened === null || opened === undefined || engine === undefined) return;
    setBusy(true);
    try {
      const entry = await readEntry(opened.file, pathOfTarget(opened.target), engine);
      if (!mountedRef.current) return;
      if (pending.some((other) => isSamePdf(other, entry))) {
        notify(`${opened.file.name} is already in the list.`);
        return;
      }
      pendingPdfs.add([entry]);
      onAdded?.();
      notify(`Added ${opened.file.name} (${countLabel(entry.pageCount, 'page')}). Place its pages on a level.`);
    } catch (err) {
      if (!mountedRef.current) return;
      notify(`Could not read ${opened.file.name}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function addFolder() {
    const picked = await fileAccess.pickFolder().catch((err: unknown) => {
      notify(`Could not open the file picker: ${(err as Error).message}`);
      return null;
    });
    if (picked === null || picked === undefined || engine === undefined) return;
    setBusy(true);
    try {
      const files = await fileAccess.readFolder(picked.folder, ['pdf']);
      if (!mountedRef.current) return;
      if (files.length === 0) {
        notify(`No PDF files in ${picked.name}.`);
        return;
      }
      const added: PendingPdf[] = [];
      const failed: string[] = [];
      let skipped = 0;
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
        if (pending.some((other) => isSamePdf(other, entry)) || added.some((other) => isSamePdf(other, entry))) {
          skipped += 1;
          continue;
        }
        added.push(entry);
      }
      if (!mountedRef.current) return;
      if (added.length > 0) {
        pendingPdfs.add(added);
        onAdded?.();
      }
      const parts = [`Added ${countLabel(added.length, 'PDF')} from ${picked.name}.`];
      if (skipped > 0) parts.push(`${skipped} already in the list.`);
      if (failed.length > 0) parts.push(`Could not read ${failed.join(', ')}.`);
      notify(parts.join(' '));
    } catch (err) {
      notify(`Could not add PDFs: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mep-buildings-actions" data-testid="add-actions">
      <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFile()}>
        Add PDFs…
      </button>
      {fileAccess.capabilities.folders && (
        <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFolder()}>
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
    </div>
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
