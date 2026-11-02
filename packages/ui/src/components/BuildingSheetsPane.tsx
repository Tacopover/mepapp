import { useState } from 'react';
import { addSheets, moveSheet, removeSheet, type BuildingFile } from '@mepapp/core';
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
  type PageRow,
  type PdfGroup,
  type PendingPdf,
} from '../buildingSheets.js';

export interface BuildingSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
}

interface Notice {
  text: string;
  error: boolean;
}

/**
 * Lists the PDFs that the user added, one row per page, and picks a level for each page.
 * Every level choice goes through update, which writes the building file. Added PDFs that have no level yet stay in a list in this pane only.
 */
export function BuildingSheetsPane({ file, update, fileAccess, engine }: BuildingSheetsPaneProps) {
  const [pending, setPending] = useState<PendingPdf[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = groupPdfs(file, pending);
  const totals = pdfTotals(groups);
  const noEngineReason = engine === undefined ? 'PDF reading is not available in this version of the app.' : undefined;
  const disabled = busy || engine === undefined;

  function notify(text: string) {
    setNotice({ text, error: text.startsWith('Could not') });
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

  function removeAllSheets(group: PdfGroup) {
    const ids = group.rows.flatMap((row) => (row.sheet === null ? [] : [row.sheet.id]));
    void update((f) => ids.reduce((acc, id) => removeSheet(acc, id), f));
  }

  function chooseLevel(group: PdfGroup, row: PageRow, levelId: string) {
    const sheet = row.sheet;
    if (levelId === '') {
      if (sheet !== null) void update((f) => removeSheet(f, sheet.id));
      return;
    }
    if (sheet !== null) {
      void update((f) => moveSheet(f, sheet.id, levelId));
      return;
    }
    void update((f) => {
      const result = addSheets(f, levelId, [newSheetPage(group, row.pageIndex)]);
      return result.ok ? result.file : f;
    });
  }

  return (
    <div className="mep-section" data-testid="sheets-pane">
      <h4>Sheets</h4>
      <div className="mep-buildings-actions">
        <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFile()}>
          Add PDFs…
        </button>
        {fileAccess.capabilities.folders && (
          <button type="button" disabled={disabled} title={noEngineReason} onClick={() => void addFolder()}>
            Add folder…
          </button>
        )}
      </div>
      <p className="mep-hint">Pages without a level are kept only while this dialog is open.</p>
      {busy && <p className="mep-hint" data-testid="sheets-busy">Reading PDFs…</p>}
      {notice !== null && (
        <p
          className={notice.error ? 'mep-hint mep-buildings-message' : 'mep-hint mep-buildings-notice'}
          role="status"
          data-testid="sheets-notice"
        >
          {notice.text} <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}
      {groups.length === 0 && <p className="mep-hint">No PDFs yet. Add PDFs, then pick a level for each page.</p>}
      {groups.length > 0 && (
        <p className="mep-hint" data-testid="sheets-totals">
          {countLabel(totals.pdfs, 'PDF')}, {countLabel(totals.pages, 'page')}, {totals.assigned} assigned
        </p>
      )}
      {groups.length > 0 && file.levels.length === 0 && (
        <p className="mep-hint">Add a level first. Then you can pick a level for each page.</p>
      )}
      {groups.map((group) => {
        const showPages = !group.collapsedByDefault || expanded[group.key] === true;
        const assigned = group.rows.filter((row) => row.sheet !== null).length;
        return (
          <div key={group.key} className="mep-sheets-group" data-testid="pdf-group">
            <div className="mep-buildings-actions">
              <b>{group.fileName}</b>
              {group.path !== undefined && <span className="mep-hint">{group.path}</span>}
              <span className="mep-hint">
                {group.pending ? countLabel(group.pageCount, 'page') : countLabel(group.rows.length, 'assigned page')}
              </span>
              {group.pending && (
                <button type="button" onClick={() => removePending(group)}>
                  Remove from list
                </button>
              )}
              {assigned > 0 && (
                <button
                  type="button"
                  title="Remove all sheets of this PDF from the building"
                  onClick={() => removeAllSheets(group)}
                >
                  Remove sheets
                </button>
              )}
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
                <div key={row.pageIndex} className="mep-elem-row mep-sheet-page-row" data-testid="page-row">
                  <span>Page {row.pageIndex + 1}</span>
                  <select
                    aria-label={`Level for ${group.fileName} page ${row.pageIndex + 1}`}
                    value={row.sheet?.levelId ?? ''}
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
