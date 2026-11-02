import { useEffect, useRef, useState } from 'react';
import type { RebuildResult } from '../rebuildSummaries.js';

export interface BuildingSummariesPaneProps {
  hasSheets: boolean;
  /** Undefined when the app has no PDF engine: the button is disabled with a reason. */
  onRebuild: ((run: { signal: AbortSignal; onProgress: (done: number, total: number, name: string) => void }) => Promise<RebuildResult | undefined>) | undefined;
  /** Called when a run ends (any result) so the sheet rows read the summaries again. */
  onDone: () => void;
}

interface Progress {
  done: number;
  total: number;
  name: string;
}

/** Rebuilds the saved sheet summaries of the open building, with a progress line, a cancel button and the result of the last run. */
export function BuildingSummariesPane({ hasSheets, onRebuild, onDone }: BuildingSummariesPaneProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, name: '' });
  const [last, setLast] = useState<{ result: RebuildResult | undefined; error?: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const buttonTitle = !hasSheets
    ? 'Add sheets first.'
    : onRebuild === undefined
      ? 'PDF reading is not available in this version of the app.'
      : undefined;

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

  return (
    <div className="mep-section" data-testid="summaries-pane">
      <h4>Summaries</h4>
      <div className="mep-buildings-actions">
        <button
          type="button"
          data-testid="rebuild-summaries"
          disabled={running || !hasSheets || onRebuild === undefined}
          title={buttonTitle}
          onClick={() => void run()}
        >
          Rebuild summaries
        </button>
        {running && (
          <button type="button" data-testid="rebuild-cancel" onClick={() => controllerRef.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
      {running && (
        <p className="mep-hint" data-testid="rebuild-progress">
          {progress.name !== '' ? `${progress.done + 1} of ${progress.total}: ${progress.name}` : `${progress.done} of ${progress.total}`}
        </p>
      )}
      {last !== null && (
        <div className="mep-rebuild-result" data-testid="rebuild-result">
          {last.error !== undefined ? (
            <p>The rebuild failed: {last.error}</p>
          ) : last.result === undefined ? (
            <p>The rebuild did not run. See the message in the header.</p>
          ) : (
            <>
              <p>{`Rebuilt ${last.result.ok} of ${last.result.total} summaries.${last.result.cancelled ? ' Cancelled before the end.' : ''}`}</p>
              {last.result.failed.length > 0 && (
                <>
                  <p className="mep-hint">
                    <b>Failed ({last.result.failed.length})</b>
                  </p>
                  <ul data-testid="rebuild-failures">
                    {last.result.failed.map((failure) => (
                      <li key={failure.sheet.id}>
                        <b>{failure.sheet.location.fileName}</b>: {failure.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {last.result.notLinked.length > 0 && (
                <>
                  <p className="mep-hint">
                    <b>Saved, but not linked to the sheet ({last.result.notLinked.length})</b>
                  </p>
                  <ul data-testid="rebuild-notlinked">
                    {last.result.notLinked.map((sheet) => (
                      <li key={sheet.id}>
                        <b>{sheet.location.fileName}</b>: summary saved, but the sheet is not linked to it. Open the file in MepApp and save it.
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
