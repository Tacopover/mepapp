import { Fragment, useEffect, useRef } from 'react';
import { moveSheet, removeSheet, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { FileAccess } from '@mepapp/platform';
import { countLabel } from '../buildingLevels.js';
import { sheetGroupsOfLevel } from '../buildingSheets.js';
import {
  statusHint,
  statusLabel,
  statusTone,
  summaryCountText,
  summaryText,
  type SheetStatus,
  type SheetSummaryInfo,
} from '../buildingStatus.js';
import { RelinkConfirm, type SheetRelink } from '../useSheetRelink.js';
import { BuildingSection } from './BuildingSection.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export const SHEETS_ORIGIN = 'sheets';

export interface LevelSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  /** null = building node: all sheets, grouped by level with a header row for each level. */
  levelId: string | null;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  sheetStatus: Record<string, SheetStatus>;
  sheetSummary: Record<string, SheetSummaryInfo>;
  onRefreshStatus: () => void;
  onNotice: (text: string, error: boolean) => void;
  relinker: SheetRelink;
  /** The sheet that the user picked in the tree. The row of that sheet is marked and scrolled to. */
  highlight?: { sheetId: string; seq: number } | null;
  /** The sheets whose PDF is open in the viewer. Their Open button shows "Opened" and is disabled. */
  openedSheetIds?: ReadonlySet<string>;
}

const NO_OPENED_SHEETS: ReadonlySet<string> = new Set();

/** One block of rows. A level block (building node) has a header row with the level name. */
interface RowGroup {
  key: string;
  testId: 'pdf-group' | 'level-group';
  header: string | null;
  sheets: BuildingSheet[];
}

function rowGroups(file: BuildingFile, levelId: string | null): RowGroup[] {
  if (levelId !== null) {
    return sheetGroupsOfLevel(file, levelId).map((group) => ({ key: group.key, testId: 'pdf-group', header: null, sheets: group.sheets }));
  }
  const known = new Set(file.levels.map((level) => level.id));
  const groups: RowGroup[] = file.levels.map((level) => ({
    key: level.id,
    testId: 'level-group',
    header: level.name,
    sheets: sheetGroupsOfLevel(file, level.id).flatMap((group) => group.sheets),
  }));
  const orphans = file.sheets.filter((sheet) => !known.has(sheet.levelId));
  if (orphans.length > 0) groups.push({ key: 'no-level', testId: 'level-group', header: 'No level', sheets: orphans });
  return groups.filter((group) => group.sheets.length > 0);
}

/**
 * Lists the sheets of the selected level, one grid row per sheet, and moves, removes, opens and relinks them.
 * The columns are the same in every row: name and page, status, then the actions Open, Relink, Move to, Remove.
 * A relink changes every sheet of the same PDF, also the sheets on other levels.
 */
export function LevelSheetsPane({
  file,
  update,
  fileAccess,
  levelId,
  onOpenSheet,
  sheetStatus,
  sheetSummary,
  onRefreshStatus,
  onNotice,
  relinker,
  highlight = null,
  openedSheetIds = NO_OPENED_SHEETS,
}: LevelSheetsPaneProps) {
  const groups = rowGroups(file, levelId);
  const shown = groups.flatMap((group) => group.sheets);
  const needsFix = shown.some((sheet) => sheetStatus[sheet.id] === 'pdf-missing' || sheetStatus[sheet.id] === 'no-access');
  const rowsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const row = rowsRef.current?.querySelector<HTMLElement>('[data-highlight="true"]');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [highlight?.seq]);

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
    <BuildingSection title="Sheets" testId="level-sheets" aside={countLabel(shown.length, 'sheet')}>
      {shown.length === 0 && (
        <p className="mep-hint">
          {levelId === null ? 'No sheets in this building yet.' : 'No sheets on this level. Add PDFs below and pick this level for their pages.'}
        </p>
      )}
      <div ref={rowsRef} className="mep-srows" data-fix={needsFix ? 'true' : 'false'}>
      {groups.map((group) => (
        <div key={group.key} className="mep-sgroup" data-testid={group.testId}>
          {group.header !== null && (
            <div className="mep-sgroup-head">
              <b title={group.header}>{group.header}</b>
              <span>{countLabel(group.sheets.length, 'sheet')}</span>
            </div>
          )}
          {group.sheets.map((sheet) => {
            const status = sheetStatus[sheet.id];
            const ask = relinker.askFor(sheet.id, SHEETS_ORIGIN);
            const otherLevels = file.levels.filter((level) => level.id !== sheet.levelId);
            const hasSummary = status === 'ok' || status === 'old-summary';
            const pageText = `Page ${sheet.pageIndex + 1}`;
            const summary = hasSummary ? summaryText(sheetSummary[sheet.id]) : '';
            const tone = status !== undefined ? statusTone(status) : 'ok';
            const picked = highlight?.sheetId === sheet.id;
            return (
              <Fragment key={sheet.id}>
                <div
                  className={`${tone === 'ok' ? 'mep-srow' : `mep-srow mep-srow--${tone}`}${picked ? ' mep-srow--pick' : ''}`}
                  data-highlight={picked ? 'true' : undefined}
                  data-testid="page-row"
                  title={`${sheet.location.fileName} - ${pageText}${summary !== '' ? ` - ${summary}` : ''}`}
                >
                  <div className="mep-srow-name">
                    <b className="mep-srow-file">{sheet.location.fileName}</b>
                    <span className="mep-srow-meta">
                      <span>{pageText}</span>
                      {hasSummary && (
                        <span data-testid="sheet-summary">{summary}</span>
                      )}
                    </span>
                  </div>
                  <span className="mep-srow-status">
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
                  </span>
                  <span className="mep-srow-cell mep-srow-cell--open">
                    {openedSheetIds.has(sheet.id) ? (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        disabled
                        data-opened="true"
                        aria-label={`Opened: ${sheet.location.fileName}`}
                        title="This PDF is open in the viewer."
                      >
                        Opened
                      </button>
                    ) : sheet.location.path !== undefined && fileAccess.readPath !== undefined ? (
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
                  </span>
                  <span className="mep-srow-cell mep-srow-cell--fix">
                    {status === 'pdf-missing' && (
                      <button
                        type="button"
                        data-testid="relink-pdf"
                        aria-label={`Relink ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                        onClick={() => void relinker.relink(sheet, SHEETS_ORIGIN)}
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
                  </span>
                  <span className="mep-srow-cell mep-srow-cell--move">
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
                  </span>
                  <span className="mep-srow-cell mep-srow-cell--remove">
                    <button
                      type="button"
                      className="mep-sheets-remove"
                      aria-label={`Remove ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                      title="Remove this sheet from the building. The PDF file stays on disk."
                      onClick={() => void update((f) => removeSheet(f, sheet.id))}
                    >
                      Remove
                    </button>
                  </span>
                  {status === 'not-stamped' && (
                    <p className="mep-hint mep-sheet-hint" data-testid="sheet-hint">
                      {statusHint(status)}
                    </p>
                  )}
                </div>
                {ask !== null && <RelinkConfirm relinker={relinker} sheet={sheet} askedName={ask.pickedName} />}
              </Fragment>
            );
          })}
        </div>
      ))}
      </div>
      {shown.length > 0 && (
        <p className="mep-hint mep-sheets-count" data-testid="summary-count">
          {summaryCountText(shown, sheetSummary)}
        </p>
      )}
    </BuildingSection>
  );
}
