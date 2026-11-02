import { Fragment, useState } from 'react';
import { moveSheet, relinkSheet, removeSheet, type BuildingFile, type BuildingSheet, type SheetLocation } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { BUILDING_PDF_TYPES, pathOfTarget, readPdfInfo } from '../buildingPdfInfo.js';
import { relinkWouldDuplicate, sheetGroupsOfLevel, sheetsOfSamePdf } from '../buildingSheets.js';
import {
  statusHint,
  statusLabel,
  statusTone,
  summaryCountText,
  summaryText,
  type SheetStatus,
  type SheetSummaryInfo,
} from '../buildingStatus.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export interface LevelSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  engine: PdfEngine | undefined;
  /** null = building node: all sheets, each row also shows its level name. */
  levelId: string | null;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  sheetStatus: Record<string, SheetStatus>;
  sheetSummary: Record<string, SheetSummaryInfo>;
  onRefreshStatus: () => void;
  onNotice: (text: string, error: boolean) => void;
}

interface RelinkAsk {
  sheetId: string;
  location: SheetLocation;
  projectUuid: string;
  pickedName: string;
}

const RELINK_REFUSED = 'Could not relink: another sheet already uses this document and page.';

/**
 * Lists the sheets of the selected level, one row per sheet, and moves, removes, opens and relinks them.
 * A relink changes every sheet of the same PDF, also the sheets on other levels.
 */
export function LevelSheetsPane({
  file,
  update,
  fileAccess,
  engine,
  levelId,
  onOpenSheet,
  sheetStatus,
  sheetSummary,
  onRefreshStatus,
  onNotice,
}: LevelSheetsPaneProps) {
  const [relinkAsk, setRelinkAsk] = useState<RelinkAsk | null>(null);

  const groups = sheetGroupsOfLevel(file, levelId);
  const shown = groups.flatMap((group) => group.sheets);

  async function relink(sheet: BuildingSheet) {
    const picked = await fileAccess.openFile(BUILDING_PDF_TYPES).catch((err: unknown) => {
      onNotice(`Could not open the file picker: ${(err as Error).message}`, true);
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
        onNotice(`Could not read ${picked.file.name}: ${(err as Error).message}`, true);
        return;
      }
    }
    if (
      projectUuid !== null &&
      sheetsOfSamePdf(file, sheet).some((other) => other.projectUuid !== null && other.projectUuid !== projectUuid)
    ) {
      setRelinkAsk({ sheetId: sheet.id, location, projectUuid, pickedName: picked.file.name });
      return;
    }
    await applyRelink(sheet, location, projectUuid ?? undefined);
  }

  async function applyRelink(sheet: BuildingSheet, location: SheetLocation, projectUuid: string | undefined) {
    const ids = sheetsOfSamePdf(file, sheet).map((item) => item.id);
    if (relinkWouldDuplicate(file, ids, projectUuid)) {
      setRelinkAsk(null);
      onNotice(RELINK_REFUSED, true);
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
      onNotice(RELINK_REFUSED, true);
      return;
    }
    onNotice(`Relinked ${location.fileName}.`, false);
  }

  async function confirmRelink() {
    const ask = relinkAsk;
    setRelinkAsk(null);
    if (ask === null) return;
    const sheet = file.sheets.find((item) => item.id === ask.sheetId);
    if (sheet === undefined) return;
    await applyRelink(sheet, ask.location, ask.projectUuid);
  }

  async function grantAccess() {
    try {
      const picked = await fileAccess.pickFolder();
      if (picked === undefined) return;
      onRefreshStatus();
      onNotice(`Checked the files again after you picked ${picked.name}.`, false);
    } catch (err) {
      onNotice(`Could not open the file picker: ${(err as Error).message}`, true);
    }
  }

  async function openRow(sheet: BuildingSheet, mode: 'path' | 'pick') {
    const result = await onOpenSheet(sheet, mode);
    if (!result.ok && result.message !== null) {
      const text = result.message.startsWith('Could not')
        ? result.message
        : `Could not open ${sheet.location.fileName}: ${result.message}`;
      onNotice(text, true);
    }
  }

  return (
    <div className="mep-section" data-testid="level-sheets">
      <h4>Sheets</h4>
      {shown.length === 0 && (
        <p className="mep-hint">
          {levelId === null ? 'No sheets in this building yet.' : 'No sheets on this level. Add PDFs below and pick this level for their pages.'}
        </p>
      )}
      {groups.map((group) => (
        <div key={group.key} className="mep-sheets-group" data-testid="pdf-group">
          {group.sheets.map((sheet) => {
            const status = sheetStatus[sheet.id];
            const levelName = file.levels.find((level) => level.id === sheet.levelId)?.name;
            const otherLevels = file.levels.filter((level) => level.id !== sheet.levelId);
            return (
              <Fragment key={sheet.id}>
                <div className="mep-elem-row mep-sheet-page-row" data-testid="page-row">
                  <b>{sheet.location.fileName}</b>
                  <span>Page {sheet.pageIndex + 1}</span>
                  {levelId === null && levelName !== undefined && <span className="mep-hint">{levelName}</span>}
                  {status !== undefined && (
                    <span
                      className={`mep-sheet-status mep-sheet-status--${statusTone(status)}`}
                      data-testid="sheet-status"
                      data-status={status}
                      title={statusHint(status) || undefined}
                    >
                      {statusLabel(status)}
                    </span>
                  )}
                  {(status === 'ok' || status === 'old-summary') && (
                    <span className="mep-hint" data-testid="sheet-summary">
                      {summaryText(sheetSummary[sheet.id])}
                    </span>
                  )}
                  {sheet.location.path !== undefined && fileAccess.readPath !== undefined ? (
                    <button
                      type="button"
                      data-testid="open-sheet"
                      disabled={status === 'pdf-missing'}
                      aria-label={`Open ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                      title={status === 'pdf-missing' ? 'The PDF is missing. Relink it first.' : 'Open this sheet'}
                      onClick={() => void openRow(sheet, 'path')}
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="open-sheet"
                      aria-label={`Choose file for ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                      title="Choose the PDF file to open this sheet"
                      onClick={() => void openRow(sheet, 'pick')}
                    >
                      Choose file…
                    </button>
                  )}
                  {status === 'pdf-missing' && (
                    <button
                      type="button"
                      data-testid="relink-pdf"
                      aria-label={`Relink ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                      onClick={() => void relink(sheet)}
                    >
                      Relink…
                    </button>
                  )}
                  {status === 'no-access' && (
                    <button
                      type="button"
                      data-testid="grant-access"
                      aria-label={`Grant access for ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                      onClick={() => void grantAccess()}
                    >
                      Grant access…
                    </button>
                  )}
                  <select
                    aria-label={`Move ${sheet.location.fileName} page ${sheet.pageIndex + 1} to level`}
                    value=""
                    disabled={otherLevels.length === 0}
                    onChange={(event) => {
                      const target = event.target.value;
                      if (target !== '') void update((f) => moveSheet(f, sheet.id, target));
                    }}
                  >
                    <option value="">Move to…</option>
                    {otherLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="mep-sheets-remove"
                    aria-label={`Remove ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                    title="Remove this sheet from the building. The PDF file stays on disk."
                    onClick={() => void update((f) => removeSheet(f, sheet.id))}
                  >
                    Remove
                  </button>
                </div>
                {status === 'not-stamped' && (
                  <p className="mep-hint mep-sheet-hint" data-testid="sheet-hint">
                    {statusHint(status)}
                  </p>
                )}
                {relinkAsk !== null && relinkAsk.sheetId === sheet.id && (
                  <div className="mep-buildings-actions">
                    <p className="mep-hint" data-testid="relink-confirm">
                      The file "{relinkAsk.pickedName}" is a different document than the sheets of {sheet.location.fileName}. Relink the
                      sheets to it? They keep their levels.
                    </p>
                    <button type="button" onClick={() => void confirmRelink()}>
                      Relink to this file
                    </button>
                    <button type="button" onClick={() => setRelinkAsk(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      ))}
      {shown.length > 0 && (
        <p className="mep-hint" data-testid="summary-count">
          {summaryCountText(shown, sheetSummary)}
        </p>
      )}
    </div>
  );
}
