import { useEffect, useRef, useState } from 'react';
import type { BuildingSheet } from '@mepapp/core';
import type { FileAccess } from '@mepapp/platform';
import { otherNoSummaryText, readableNoSummaryText, rebuildResultText, type SheetStatus } from '../buildingStatus.js';
import type { RebuildResult } from '../rebuildSummaries.js';
import { RelinkConfirm, type SheetRelink } from '../useSheetRelink.js';
import { BuildingSection } from './BuildingSection.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export const REPAIR_ORIGIN = 'repair';

export interface BuildingSummariesPaneProps {
  /** How many sheets have a probed status and no summary. The button shows only when this is above 0. */
  missing: number;
  /** How many sheets have no summary and cannot be read now (file missing, no access, or not checked yet). */
  other: number;
  /** Undefined when the app has no PDF engine: the button is disabled with a reason. */
  onRebuild: ((run: { signal: AbortSignal; onProgress: (done: number, total: number, name: string) => void }) => Promise<RebuildResult | undefined>) | undefined;
  /** Called when a run ends (any result) so the sheet rows read the summaries again. */
  onDone: () => void;
  fileAccess: FileAccess;
  relinker: SheetRelink;
  sheetStatus: Record<string, SheetStatus>;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  onNotice: (text: string, error: boolean) => void;
  /** True when the PDF of the sheet was given to the app in this tab. Its row then opens without a picker. */
  canOpenCached?: (sheet: BuildingSheet) => boolean;
}

interface Progress {
  done: number;
  total: number;
  name: string;
}

/**
 * The repair action for sheets with no summary: a line with a count and the button "Read summaries now" (only when the count is above 0),
 * a progress line with Cancel, and the result of the last run. Each failed sheet has the actions that can fix it.
 * The line of the count names the sheets that can be read now. A second line names the sheets that cannot be read now.
 * The pane shows when either count is above 0, a run is going, or a last result is shown. The count line and the button need missing above 0. The second line needs other above 0.
 */
export function BuildingSummariesPane({ missing, other, onRebuild, onDone, fileAccess, relinker, sheetStatus, onOpenSheet, onNotice, canOpenCached }: BuildingSummariesPaneProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, name: '' });
  const [last, setLast] = useState<{ result: RebuildResult | undefined; error?: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function run() {
    if (onRebuild === undefined) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setLast(null);
    setProgress({ done: 0, total: 0, name: '' });
    try {
      const result = await onRebuild({
        signal: controller.signal,
        onProgress: (done, total, name) => setProgress({ done, total, name }),
      });
      setLast({ result });
    } catch (error) {
      setLast({ result: undefined, error: (error as Error).message });
    } finally {
      controllerRef.current = null;
      setRunning(false);
      onDone();
    }
  }

  async function openRow(sheet: BuildingSheet, mode: 'path' | 'pick') {
    const result = await onOpenSheet(sheet, mode);
    if (!result.ok && result.message !== null) {
      onNotice(
        result.message.startsWith('Could not') ? result.message : `Could not open ${sheet.location.fileName}: ${result.message}`,
        true,
      );
    }
  }

  if (missing === 0 && other === 0 && !running && last === null) return null;

  return (
    <BuildingSection title="Summaries" testId="summaries-pane">
      {(missing > 0 || running) && (
        <div className="mep-summaries-head">
          <span data-testid="summaries-missing">{readableNoSummaryText(missing)}</span>
          <span className="mep-summaries-actions">
            {missing > 0 && (
              <button
                type="button"
                data-testid="rebuild-summaries"
                disabled={running || onRebuild === undefined}
                title={onRebuild === undefined ? 'PDF reading is not available in this version of the app.' : undefined}
                onClick={() => void run()}
              >
                Read summaries now
              </button>
            )}
            {running && (
              <button type="button" data-testid="rebuild-cancel" onClick={() => controllerRef.current?.abort()}>
                Cancel
              </button>
            )}
          </span>
        </div>
      )}
      {missing > 0 && !running && (
        <p className="mep-hint">
          Reads each PDF of this building from disk and saves its summary. MepApp does this when you open or save a PDF.
        </p>
      )}
      {other > 0 && !running && (
        <p className="mep-hint" data-testid="summaries-other">
          {otherNoSummaryText(other)}
        </p>
      )}
      {running && (
        <>
          <p className="mep-hint" data-testid="rebuild-progress">
            {progress.name !== '' ? `${progress.done + 1} of ${progress.total}: ${progress.name}` : `${progress.done} of ${progress.total}`}
          </p>
          <p className="mep-hint">Cancel stops between documents. The document that MepApp reads now finishes first.</p>
        </>
      )}
      {last !== null && (
        <div className="mep-rebuild-result" data-testid="rebuild-result">
          {last.error !== undefined ? (
            <p>The rebuild failed: {last.error}</p>
          ) : last.result === undefined ? (
            <p>The rebuild did not run. See the message in the header.</p>
          ) : (
            <>
              <p>{`${rebuildResultText(last.result)}${last.result.linked > 0 ? ` ${last.result.linked} ${last.result.linked === 1 ? 'sheet' : 'sheets'} linked.` : ''}`}</p>
              {last.result.failed.length > 0 && (
                <>
                  <p className="mep-hint">
                    <b>Failed ({last.result.failed.length})</b>
                  </p>
                  <ul data-testid="rebuild-failures">
                    {last.result.failed.map((failure) => {
                      const sheet = failure.sheet;
                      const ask = relinker.askFor(sheet.id, REPAIR_ORIGIN);
                      const canOpenByPath = sheet.location.path !== undefined && fileAccess.readPath !== undefined;
                      const canOpenPath = canOpenByPath || canOpenCached?.(sheet) === true;
                      return (
                        <li key={sheet.id}>
                          <b>{sheet.location.fileName}</b>: {failure.reason}
                          <span className="mep-buildings-actions mep-summaries-fix">
                            <button
                              type="button"
                              data-testid="repair-relink"
                              aria-label={`Relink ${sheet.location.fileName}`}
                              onClick={() => void relinker.relink(sheet, REPAIR_ORIGIN)}
                            >
                              Relink…
                            </button>
                            <button
                              type="button"
                              data-testid="repair-open"
                              disabled={sheetStatus[sheet.id] === 'pdf-missing'}
                              title={
                                sheetStatus[sheet.id] === 'pdf-missing'
                                  ? 'The PDF is missing. Relink it first.'
                                  : canOpenPath
                                    ? undefined
                                    : fileAccess.readPath === undefined
                                      ? 'This browser cannot open the PDF by itself. Choose the file again.'
                                      : undefined
                              }
                              aria-label={`${canOpenPath ? 'Open' : 'Choose file for'} ${sheet.location.fileName}`}
                              onClick={() => void openRow(sheet, canOpenByPath ? 'path' : 'pick')}
                            >
                              {canOpenPath ? 'Open' : 'Choose file…'}
                            </button>
                          </span>
                          {ask !== null && <RelinkConfirm relinker={relinker} sheet={sheet} askedName={ask.pickedName} />}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </BuildingSection>
  );
}
