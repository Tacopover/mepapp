import { useEffect, useState } from 'react';
import { addSheets, type BuildingFile } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { countLabel } from '../buildingLevels.js';
import { BUILDING_PDF_TYPES, joinFolderPath, pathOfTarget, readPdfInfo } from '../buildingPdfInfo.js';
import {
  groupPdfs,
  isSamePdf,
  newSheetPage,
  pdfGroupKey,
  pdfTotals,
  waitingGroups,
  type PageRow,
  type PdfGroup,
  type PendingPdf,
} from '../buildingSheets.js';

export interface BuildingSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  onRefreshStatus: () => void;
  onPendingCountChange?: (count: number) => void;
  onNotice: (text: string, error: boolean) => void;
}

/**
 * Adds PDFs to the list of this dialog and picks a level for each page that has no level yet.
 * Every level choice goes through update, which writes the building file. Added PDFs that have no level yet stay in a list in this pane only.
 */
export function BuildingSheetsPane({
  file,
  update,
  fileAccess,
  engine,
  onRefreshStatus,
  onPendingCountChange,
  onNotice,
}: BuildingSheetsPaneProps) {
  const [pending, setPending] = useState<PendingPdf[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onRefreshStatus();
  }, []);

  const groups = groupPdfs(file, pending);
  const waiting = waitingGroups(file, pending);
  const waitingPages = waiting.reduce((n, group) => n + group.rows.length, 0);
  useEffect(() => {
    onPendingCountChange?.(waitingPages);
  }, [waitingPages]);
  useEffect(() => {
    const full = new Set(groups.filter((group) => group.pending && !group.rows.some((row) => row.sheet === null)).map((group) => group.key));
    if (full.size === 0) return;
    setPending((list) => {
      const next = list.filter((pdf) => !full.has(pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName)));
      return next.length === list.length ? list : next;
    });
  }, [file, pending]);
  const totals = pdfTotals(groups.filter((group) => group.pending));
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
      if (pending.some((other) => isSamePdf(other, entry))) {
        notify(`${opened.file.name} is already in the list.`);
        return;
      }
      setPending((list) => [...list, entry]);
      notify(`Added ${opened.file.name} (${countLabel(entry.pageCount, 'page')}).`);
    } catch (err) {
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
      if (files.length === 0) {
        notify(`No PDF files in ${picked.name}.`);
        return;
      }
      const added: PendingPdf[] = [];
      const failed: string[] = [];
      let skipped = 0;
      for (const item of files) {
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
      setPending((list) => [...list, ...added]);
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

  function removePending(group: PdfGroup) {
    setPending((list) => list.filter((pdf) => pdfGroupKey(pdf.projectUuid, pdf.path, pdf.fileName) !== group.key));
  }

  function chooseLevel(group: PdfGroup, row: PageRow, levelId: string) {
    if (levelId === '') return;
    void update((f) => {
      const result = addSheets(f, levelId, [newSheetPage(group, row.pageIndex)]);
      return result.ok ? result.file : f;
    });
  }

  return (
    <div className="mep-section" data-testid="sheets-pane">
      <h4>Add PDFs</h4>
      <div className="mep-buildings-actions">
        <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFile()}>
          Add PDFs…
        </button>
        {fileAccess.capabilities.folders && (
          <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFolder()}>
            Add folder…
          </button>
        )}
        <button type="button" data-testid="refresh-status" onClick={() => onRefreshStatus()}>
          Check files again
        </button>
      </div>
      <p className="mep-hint">Pages without a level are kept only while this dialog is open.</p>
      {busy && <p className="mep-hint" data-testid="sheets-busy">Reading PDFs…</p>}
      {waiting.length === 0 && <p className="mep-hint">No PDFs yet. Add PDFs, then pick a level for each page.</p>}
      {waiting.length > 0 && (
        <p className="mep-hint" data-testid="sheets-totals">
          {countLabel(totals.pdfs, 'PDF')}, {countLabel(totals.pages, 'page')}, {totals.assigned} assigned
        </p>
      )}
      {waiting.length > 0 && file.levels.length === 0 && (
        <p className="mep-hint">Add a level first. Then you can pick a level for each page.</p>
      )}
      {waiting.map((group) => {
        const showPages = !group.collapsedByDefault || expanded[group.key] === true;
        return (
          <div key={group.key} className="mep-sheets-group" data-testid="pdf-group">
            <div className="mep-buildings-actions">
              <b>{group.fileName}</b>
              {group.path !== undefined && <span className="mep-hint">{group.path}</span>}
              <span className="mep-hint">{countLabel(group.pageCount, 'page')}</span>
              <button
                type="button"
                title="Forget this PDF in this dialog. The file on disk does not change."
                onClick={() => removePending(group)}
              >
                Remove from list
              </button>
              {group.collapsedByDefault && (
                <button
                  type="button"
                  aria-expanded={showPages}
                  onClick={() => setExpanded((map) => ({ ...map, [group.key]: !(map[group.key] === true) }))}
                >
                  {showPages ? 'Hide pages' : 'Show pages'}
                </button>
              )}
            </div>
            {showPages &&
              group.rows.map((row) => (
                <div key={`page-${row.pageIndex}`} className="mep-elem-row mep-sheet-page-row" data-testid="page-row">
                  <span>Page {row.pageIndex + 1}</span>
                  <select
                    aria-label={`Level for ${group.fileName} page ${row.pageIndex + 1}`}
                    value=""
                    disabled={file.levels.length === 0}
                    onChange={(event) => chooseLevel(group, row, event.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {file.levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        );
      })}
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
