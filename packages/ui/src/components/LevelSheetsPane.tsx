import { Fragment, useEffect, useRef, useState } from 'react';
import { moveSheet, removeSheet, sheetMoveBlock, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { FileAccess, OpenedFile } from '@mepapp/platform';
import { countLabel } from '../buildingLevels.js';
import { BUILDING_PDF_TYPES } from '../buildingPdfInfo.js';
import { sheetGroupsOfLevel, sheetRemoveRefusal } from '../buildingSheets.js';
import {
  statusHint,
  statusLabel,
  statusTone,
  summaryCountText,
  summaryText,
  type SheetStatus,
  type SheetSummaryInfo,
} from '../buildingStatus.js';
import { changedCancelText, changedManyUseText, splitChangedPicks } from '../changedFile.js';
import { bandView } from '../pdfFolder.js';
import { pdfsNeedingFile, reconnectMenuTooltip, reconnectResult, reconnectTooltip, type PdfNeed } from '../reconnectPdfs.js';
import { SheetFileCache } from '../sheetFileCache.js';
import { chooseFileTitle, sheetRowLine } from '../sheetRowLine.js';
import { ChangedFileConfirm, type ChangedFiles } from '../useChangedFile.js';
import { RelinkConfirm, type SheetRelink } from '../useSheetRelink.js';
import type { PdfFolderControl } from '../usePdfFolder.js';
import { BuildingSection } from './BuildingSection.js';
import { ReconnectButton } from './ReconnectButton.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export const SHEETS_ORIGIN = 'sheets';

export interface LevelSheetsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  fileAccess: FileAccess;
  /** null = building node: all sheets, grouped by level with a header row for each level. */
  levelId: string | null;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick', options?: { picker?: boolean }) => Promise<SheetOpenResult>;
  sheetStatus: Record<string, SheetStatus>;
  sheetSummary: Record<string, SheetSummaryInfo>;
  onRefreshStatus: () => void;
  onNotice: (text: string, error: boolean) => void;
  relinker: SheetRelink;
  /** The sheet that the user picked in the tree. The row of that sheet is marked and scrolled to. */
  highlight?: { sheetId: string; seq: number } | null;
  /** The sheets whose PDF is open in the viewer. Their Open button shows "Opened" and is disabled. */
  openedSheetIds?: ReadonlySet<string>;
  /** True when the PDF of the sheet was given to the app in this tab. Its row then opens without a picker. */
  canOpenCached?: (sheet: BuildingSheet) => boolean;
  /** True when the PDF of the sheet is in the memory of this tab. A saved file that the browser has not allowed yet is not. */
  inTab?: (sheet: BuildingSheet) => boolean;
  /** Keeps the PDF files that the user picked in this tab, so their sheets open without a second pick. */
  rememberFiles?: (opened: OpenedFile[]) => void;
  /** True when two different files have the name and size of the sheet. The app then uses neither. */
  isAmbiguous?: (sheet: BuildingSheet) => boolean;
  /** The PDF folder of the building (Chrome and Edge only). Undefined when the browser cannot keep PDF handles. */
  folder?: PdfFolderControl;
  /** The prompt for a PDF that changed after it was added, and the rows that wait for a new file. */
  changed?: ChangedFiles;
}

const NO_OPENED_SHEETS: ReadonlySet<string> = new Set();

function joinText(...parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part !== '').join(' ');
}


function sheetKeys(sheets: BuildingSheet[]): Set<string> {
  const keys = new Set<string>();
  for (const sheet of sheets) {
    const size = sheet.location.sizeBytes;
    if (size !== undefined) keys.add(SheetFileCache.key(sheet.location.fileName, size));
  }
  return keys;
}

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
  canOpenCached,
  inTab,
  rememberFiles,
  isAmbiguous,
  folder,
  changed,
}: LevelSheetsPaneProps) {
  const groups = rowGroups(file, levelId);
  const shown = groups.flatMap((group) => group.sheets);
  const needsFix = shown.some((sheet) => sheetStatus[sheet.id] === 'pdf-missing' || sheetStatus[sheet.id] === 'no-access');
  const needed = pdfsNeedingFile(shown, canOpenCached ?? (() => false), openedSheetIds);
  const folderState = folder?.state;
  const band =
    fileAccess.readPath === undefined && rememberFiles !== undefined
      ? bandView({
          canStore: folder !== undefined,
          checked: folderState?.checked ?? true,
          busy: folderState?.busy ?? false,
          folderName: folderState?.folderName ?? null,
          folderAccess: folderState?.folderAccess ?? 'prompt',
          savedNeedAllow: folderState?.savedNeedAllow ?? 0,
          needFile: needed.length,
          changedPdfs: changed?.changedPdfCount ?? 0,
        })
      : null;
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const [missingPages, setMissingPages] = useState<Map<string, number>>(new Map());

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

  async function allowFolder(pick: boolean) {
    const scope = shown;
    const outcome = await folder?.allow({ pick, scope });
    if (outcome === undefined) return;
    const scan = outcome.changed;
    if (scan !== null && changed !== undefined && scan.files.length > 0) {
      const offered = await changed.offerFiles(scan.files, (answer) => {
        const names = new Set(answer.items.map((item) => item.fileName));
        if (answer.used) return { text: joinText(scan.noticeFor('found', names)?.text, changedManyUseText(answer.items)), error: false };
        return { text: joinText(scan.noticeFor('excluded', names)?.text, changedCancelText(answer.items)), error: false };
      });
      if (offered.prompted) return;
      const base = scan.noticeFor('excluded');
      const text = joinText(base?.text, offered.extraText);
      if (text !== '') {
        onNotice(text, base?.error === true);
        return;
      }
    }
    if (scan !== null && scan.files.length === 0) {
      const only = scan.noticeFor('excluded');
      if (only !== null) {
        onNotice(only.text, only.error);
        return;
      }
    }
    if (outcome.notice !== null) onNotice(outcome.notice.text, outcome.notice.error);
  }

  async function reconnect() {
    // Nothing lacks a file, but saved PDFs wait for the browser to allow them: the pick gives the files now, so the result counts those PDFs.
    const looksForSaved = needed.length === 0 && inTab !== undefined;
    const needed0 = looksForSaved ? pdfsNeedingFile(shown, inTab, openedSheetIds) : needed;
    const hasFile = looksForSaved ? inTab : canOpenCached;
    let opened: OpenedFile[];
    try {
      opened = await fileAccess.openFiles(BUILDING_PDF_TYPES);
    } catch (err) {
      onNotice(`Could not open the file picker: ${(err as Error).message}`, true);
      return;
    }
    if (opened.length === 0) return;
    const split = splitChangedPicks(file, opened);
    const changedFiles = split.changed;
    rememberFiles?.(opened.filter((item) => !changedFiles.includes(item) && !split.dropped.includes(item)));
    const input = {
      needed: needed0,
      picked: opened.map((item) => ({ name: item.file.name, size: item.file.size })),
      scopeKeys: sheetKeys(shown),
      buildingKeys: sheetKeys(file.sheets),
      isFound: (need: PdfNeed) => hasFile?.(need.sheet) === true,
      isAmbiguous: (need: PdfNeed) => isAmbiguous?.(need.sheet) === true,
      levelScope: levelId !== null,
    };
    if (changedFiles.length === 0) {
      const base = reconnectResult(input);
      onNotice(base.text, base.error);
      return;
    }
    const resultFor = (names: ReadonlySet<string>, mode: 'found' | 'excluded') =>
      reconnectResult({ ...input, changedNames: names, changedMode: mode });
    const offered =
      changed === undefined
        ? { prompted: false, extraText: '' }
        : await changed.offerFiles(changedFiles, (answer) => {
            const names = new Set(answer.items.map((item) => item.fileName));
            if (answer.used) return { text: joinText(resultFor(names, 'found').text, changedManyUseText(answer.items)), error: false };
            return { text: joinText(resultFor(names, 'excluded').text, changedCancelText(answer.items)), error: false };
          });
    if (offered.prompted) return;
    const base = resultFor(new Set(changedFiles.map((item) => item.file.name)), 'excluded');
    const text = joinText(base.text, offered.extraText);
    if (text !== '') onNotice(text, base.error);
  }

  async function openRow(sheet: BuildingSheet, mode: 'path' | 'pick', options?: { picker?: boolean }) {
    const result = await onOpenSheet(sheet, mode, options);
    const pageMissing = !result.ok && 'pageMissing' in result && result.pageMissing === true;
    setMissingPages((current) => {
      if (!pageMissing && !current.has(sheet.id)) return current;
      const next = new Map(current);
      if (pageMissing) next.set(sheet.id, sheet.pageIndex + 1);
      else next.delete(sheet.id);
      return next;
    });
    if (!result.ok && result.message !== null) {
      const text = result.message.startsWith('Could not')
        ? result.message
        : `Could not open ${sheet.location.fileName}: ${result.message}`;
      onNotice(text, true);
    }
  }

  return (
    <BuildingSection title="Sheets" testId="level-sheets" aside={countLabel(shown.length, 'sheet')}>
      {band !== null && (
        <div className="mep-reconnect" data-testid="reconnect-band">
          <p className="mep-hint" data-testid="reconnect-hint">{band.hint}</p>
          <div className="mep-reconnect-buttons">
            <ReconnectButton
              tooltip={folder !== undefined ? reconnectMenuTooltip(levelId !== null) : reconnectTooltip(levelId !== null)}
              disabled={band.reconnectDisabled}
              menu={band.menu}
              onChoose={(action) => (action === 'files' ? void reconnect() : void allowFolder(action === 'pick'))}
              onDirect={() => void reconnect()}
            />
          </div>
        </div>
      )}
      {changed?.offer?.scope === 'band' && (
        <ChangedFileConfirm offer={changed.offer} onYes={() => void changed.confirm()} onNo={changed.cancel} />
      )}
      {shown.length === 0 && (
        <p className="mep-hint">
          {levelId === null ? 'No sheets in this building yet.' : 'No sheets on this level. Use Add PDFs… below.'}
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
            const line = sheetRowLine({
              web: fileAccess.readPath === undefined,
              status,
              opened: openedSheetIds.has(sheet.id),
              missingPage: openedSheetIds.has(sheet.id) ? null : (missingPages.get(sheet.id) ?? null),
              changed: changed?.changedSheetIds.has(sheet.id) === true,
              canOpen: canOpenCached?.(sheet) === true,
            });
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
                    ) : changed?.changedSheetIds.has(sheet.id) === true ? (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        aria-label={`Choose file for ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                        title={chooseFileTitle(true, fileAccess.readPath === undefined)}
                        onClick={() => void openRow(sheet, 'pick', { picker: true })}
                      >
                        Choose file…
                      </button>
                    ) : canOpenCached?.(sheet) === true ? (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        aria-label={`Open ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                        title="Open this sheet"
                        onClick={() => void openRow(sheet, 'pick')}
                      >
                        Open
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="open-sheet"
                        aria-label={`Choose file for ${sheet.location.fileName} page ${sheet.pageIndex + 1}`}
                        title={chooseFileTitle(false, fileAccess.readPath === undefined)}
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
                        if (target === '') return;
                        const block = sheetMoveBlock(file, sheet.id, target);
                        if (block !== null) {
                          onNotice(`Could not move ${sheet.location.fileName} page ${sheet.pageIndex + 1}. ${block}`, true);
                          return;
                        }
                        void update((f) => moveSheet(f, sheet.id, target));
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
                      onClick={() => {
                        const refusal = sheetRemoveRefusal(file, sheet.id);
                        if (refusal !== null) {
                          onNotice(`Could not remove ${sheet.location.fileName} page ${sheet.pageIndex + 1}. ${refusal}`, true);
                          return;
                        }
                        setMissingPages((current) => {
                          if (!current.has(sheet.id)) return current;
                          const next = new Map(current);
                          next.delete(sheet.id);
                          return next;
                        });
                        void update((f) => removeSheet(f, sheet.id));
                      }}
                    >
                      Remove
                    </button>
                  </span>
                  {line !== null && (
                    <p className="mep-hint mep-sheet-hint" data-testid="sheet-hint">
                      {line}
                    </p>
                  )}
                </div>
                {ask !== null && <RelinkConfirm relinker={relinker} sheet={sheet} askedName={ask.pickedName} />}
                {changed?.offer?.scope === 'row' && changed.offer.sheetId === sheet.id && (
                  <ChangedFileConfirm offer={changed.offer} onYes={() => void changed.confirm()} onNo={changed.cancel} />
                )}
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
