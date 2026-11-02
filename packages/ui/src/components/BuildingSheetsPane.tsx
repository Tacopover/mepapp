import { useEffect, useState } from 'react';
import { addSheets, moveSheet, relinkSheet, removeSheet, type BuildingFile, type BuildingSheet, type SheetLocation } from '@mepapp/core';
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
  relinkWouldDuplicate,
  type PageRow,
  type PdfGroup,
  type PendingPdf,
} from '../buildingSheets.js';
import { statusLabel, statusTone, summaryText, type SheetStatus, type SheetSummaryInfo } from '../buildingStatus.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export interface BuildingSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  sheetStatus: Record<string, SheetStatus>;
  sheetSummary: Record<string, SheetSummaryInfo>;
  onRefreshStatus: () => void;
  onPendingCountChange?: (count: number) => void;
}

interface RelinkAsk {
  groupKey: string;
  location: SheetLocation;
  projectUuid: string;
  pickedName: string;
}

interface Notice {
  text: string;
  error: boolean;
}

/**
 * Lists the PDFs that the user added, one row per page, and picks a level for each page.
 * Every level choice goes through update, which writes the building file. Added PDFs that have no level yet stay in a list in this pane only.
 */
export function BuildingSheetsPane({
  file,
  update,
  fileAccess,
  engine,
  onOpenSheet,
  sheetStatus,
  sheetSummary,
  onRefreshStatus,
  onPendingCountChange,
}: BuildingSheetsPaneProps) {
  const [pending, setPending] = useState<PendingPdf[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [relinkAsk, setRelinkAsk] = useState<RelinkAsk | null>(null);

  useEffect(() => {
    onRefreshStatus();
  }, []);

  const groups = groupPdfs(file, pending);
  const waitingPages = groups.filter((g) => g.pending).reduce((n, g) => n + g.rows.filter((row) => row.sheet === null).length, 0);
  useEffect(() => {
    onPendingCountChange?.(waitingPages);
  }, [waitingPages]);
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

  function groupHasStatus(group: PdfGroup, status: SheetStatus): boolean {
    return group.rows.some((row) => row.sheet !== null && sheetStatus[row.sheet.id] === status);
  }

  async function relink(group: PdfGroup) {
    const picked = await fileAccess.openFile(BUILDING_PDF_TYPES).catch((err: unknown) => {
      notify(`Could not open the file picker: ${(err as Error).message}`);
      return undefined;
    });
    if (picked === undefined) return;
    const path = pathOfTarget(picked.target);
    const location: SheetLocation = {
      fileName: picked.file.name,
      sizeBytes: picked.file.size,
      ...(path !== undefined ? { path } : {}),
    };
    let projectUuid: string | null = null;
    if (engine !== undefined) {
      try {
        projectUuid = (await readPdfInfo(picked.file, engine)).projectUuid;
      } catch (err) {
        notify(`Could not read ${picked.file.name}: ${(err as Error).message}`);
        return;
      }
    }
    if (
      projectUuid !== null &&
      group.rows.some((row) => row.sheet !== null && row.sheet.projectUuid !== null && row.sheet.projectUuid !== projectUuid)
    ) {
      setRelinkAsk({ groupKey: group.key, location, projectUuid, pickedName: picked.file.name });
      return;
    }
    await applyRelink(group, location, projectUuid ?? undefined);
  }

  async function applyRelink(group: PdfGroup, location: SheetLocation, projectUuid: string | undefined) {
    const ids = group.rows.flatMap((row) => (row.sheet === null ? [] : [row.sheet.id]));
    if (relinkWouldDuplicate(file, ids, projectUuid)) {
      setRelinkAsk(null);
      setNotice({ text: 'Could not relink: another sheet already uses this document and page.', error: true });
      return;
    }
    let refused = false;
    await update((f) =>
      ids.reduce((acc, id) => {
        const result = relinkSheet(acc, id, location, projectUuid);
        if (!result.ok) {
          refused = true;
          return acc;
        }
        return result.file;
      }, f),
    );
    if (refused) {
      setNotice({ text: 'Could not relink: another sheet already uses this document and page.', error: true });
      return;
    }
    notify(`Relinked ${location.fileName}.`);
  }

  async function confirmRelink() {
    const ask = relinkAsk;
    setRelinkAsk(null);
    const group = groups.find((item) => item.key === ask?.groupKey);
    if (ask === null || group === undefined) return;
    await applyRelink(group, ask.location, ask.projectUuid);
  }

  async function grantAccess() {
    try {
      const picked = await fileAccess.pickFolder();
      if (picked === undefined) return;
      onRefreshStatus();
      notify(`Checked the files again after you picked ${picked.name}.`);
    } catch (err) {
      notify(`Could not open the file picker: ${(err as Error).message}`);
    }
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

  async function openRow(row: PageRow, mode: 'path' | 'pick') {
    if (row.sheet === null) return;
    const result = await onOpenSheet(row.sheet, mode);
    if (!result.ok && result.message !== null) {
      const text = result.message.startsWith('Could not')
        ? result.message
        : `Could not open ${row.sheet.location.fileName}: ${result.message}`;
      setNotice({ text, error: true });
    }
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
        <button type="button" data-testid="refresh-status" onClick={() => onRefreshStatus()}>
          Check files again
        </button>
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
                  className="mep-sheets-remove"
                  title="Remove all sheets of this PDF from the building"
                  onClick={() => removeAllSheets(group)}
                >
                  Remove sheets
                </button>
              )}
              {groupHasStatus(group, 'pdf-missing') && (
                <button type="button" data-testid="relink-pdf" onClick={() => void relink(group)}>
                  Relink…
                </button>
              )}
              {groupHasStatus(group, 'no-access') && (
                <button type="button" data-testid="grant-access" onClick={() => void grantAccess()}>
                  Grant access…
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
            {relinkAsk !== null && relinkAsk.groupKey === group.key && (
              <div className="mep-buildings-actions">
                <p className="mep-hint" data-testid="relink-confirm">
                  The file "{relinkAsk.pickedName}" is a different document than the sheets of {group.fileName}. Relink the sheets to
                  it? They keep their levels.
                </p>
                <button type="button" onClick={() => void confirmRelink()}>
                  Relink to this file
                </button>
                <button type="button" onClick={() => setRelinkAsk(null)}>
                  Cancel
                </button>
              </div>
            )}
            {showPages &&
              group.rows.map((row) => (
                <div key={row.sheet?.id ?? `page-${row.pageIndex}`} className="mep-elem-row mep-sheet-page-row" data-testid="page-row">
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
                  {row.sheet !== null &&
                    (row.sheet.location.path !== undefined && fileAccess.readPath !== undefined ? (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        disabled={sheetStatus[row.sheet.id] === 'pdf-missing'}
                        title={
                          sheetStatus[row.sheet.id] === 'pdf-missing' ? 'The PDF is missing. Relink it first.' : 'Open this sheet'
                        }
                        onClick={() => void openRow(row, 'path')}
                      >
                        Open
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        title="Open this sheet: pick the PDF file again"
                        onClick={() => void openRow(row, 'pick')}
                      >
                        Pick the file again…
                      </button>
                    ))}
                  {row.sheet !== null && sheetStatus[row.sheet.id] !== undefined && (
                    <span
                      className={`mep-sheet-status mep-sheet-status--${statusTone(sheetStatus[row.sheet.id])}`}
                      data-testid="sheet-status"
                      data-status={sheetStatus[row.sheet.id]}
                    >
                      {statusLabel(sheetStatus[row.sheet.id])}
                    </span>
                  )}
                  {row.sheet !== null && sheetStatus[row.sheet.id] !== 'no-summary' && (
                    <span className="mep-hint" data-testid="sheet-summary">
                      {summaryText(sheetSummary[row.sheet.id])}
                    </span>
                  )}
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
