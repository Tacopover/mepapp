import { useState } from 'react';
import { addSheets, type BuildingFile } from '@mepapp/core';
import { countLabel } from '../buildingLevels.js';
import { newSheetPage, type PdfGroup } from '../buildingSheets.js';
import { BuildingSection } from './BuildingSection.js';

export interface NotPlacedPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  /** The waiting PDFs (usePendingPdfs): pages with no level only. */
  waiting: readonly PdfGroup[];
  totals: { pdfs: number; pages: number; assigned: number };
  onRemove: (key: string) => void;
}

/** The pages of the added PDFs that have no level yet. Each page gets a level here, or all pages of one PDF get one level in one step. */
export function NotPlacedPane({ file, update, waiting, totals, onRemove }: NotPlacedPaneProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const noLevels = file.levels.length === 0;

  function placePages(group: PdfGroup, pageIndexes: readonly number[], levelId: string) {
    if (levelId === '') return;
    void update((f) => {
      const result = addSheets(
        f,
        levelId,
        pageIndexes.map((pageIndex) => newSheetPage(group, pageIndex)),
      );
      return result.ok ? result.file : f;
    });
  }

  return (
    <BuildingSection
      title="Not placed"
      testId="sheets-pane"
      aside={waiting.length > 0 ? `${countLabel(totals.pages - totals.assigned, 'page')} waiting` : undefined}
    >
      <p data-testid="not-placed-line">These pages are not saved in the building. Place them or they go when you close this dialog.</p>
      {waiting.length > 0 && (
        <p className="mep-hint" data-testid="sheets-totals">
          {countLabel(totals.pdfs, 'PDF')}, {countLabel(totals.pages, 'page')}, {totals.assigned} assigned
        </p>
      )}
      {noLevels && <p className="mep-hint">Add a level first. Then you can pick a level for each page.</p>}
      {waiting.map((group) => {
        const showPages = !group.collapsedByDefault || expanded[group.key] === true;
        return (
          <div key={group.key} className="mep-sgroup" data-testid="pdf-group">
            <div className="mep-notplaced-head">
              <b>{group.fileName}</b>
              {group.path !== undefined && <span className="mep-hint">{group.path}</span>}
              <span className="mep-hint">{countLabel(group.rows.length, 'page')} not placed</span>
              <select
                data-testid="assign-all"
                aria-label={`Assign all pages of ${group.fileName} to level`}
                value=""
                disabled={noLevels}
                onChange={(event) =>
                  placePages(
                    group,
                    group.rows.map((row) => row.pageIndex),
                    event.target.value,
                  )
                }
              >
                <option value="">Assign all pages to…</option>
                {file.levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Forget this PDF in this dialog. The file on disk does not change."
                onClick={() => onRemove(group.key)}
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
                <div key={`page-${row.pageIndex}`} className="mep-prow" data-testid="page-row">
                  <span>Page {row.pageIndex + 1}</span>
                  <select
                    aria-label={`Level for ${group.fileName} page ${row.pageIndex + 1}`}
                    value=""
                    disabled={noLevels}
                    onChange={(event) => placePages(group, [row.pageIndex], event.target.value)}
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
    </BuildingSection>
  );
}
