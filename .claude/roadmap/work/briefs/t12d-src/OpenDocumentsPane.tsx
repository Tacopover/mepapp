import { useRef, useState, type ReactNode } from 'react';
import { addLevel, type BuildingFile } from '@mepapp/core';
import { defaultLevelName, nextLevelElevation } from '../buildingLevels.js';
import { addOpenDocumentPages } from '../openDocumentAdd.js';
import type { OpenDocumentRow } from '../openDocumentsView.js';
import { BuildingSection } from './BuildingSection.js';

export interface OpenDocumentsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  rows: readonly OpenDocumentRow[];
  /** The selected level. null (building node): the first level is the target. */
  levelId: string | null;
  onNotice: (text: string, error: boolean) => void;
  /** The action row to add PDFs from disk. */
  children?: ReactNode;
}

/** After an add the lists above grow and this section moves down. A second click inside this time would hit another row. */
const CLICK_GUARD_MS = 450;

function placedText(row: OpenDocumentRow): string {
  if (row.doc.pageCount === 1) return row.pages[0]?.sheet ? `Placed on ${row.pages[0].levelName ?? 'a level'}` : 'Not placed';
  const placed = row.pages.filter((page) => page.sheet !== null).length;
  return `${row.doc.pageCount} pages: ${placed} placed`;
}

function sheetsText(count: number): string {
  return `${count} ${count === 1 ? 'sheet' : 'sheets'}`;
}

/**
 * The quiet "Add files" strip at the bottom of the right pane: Add PDFs and Add folder (children), and a block with the documents
 * that are open in the viewer. One click adds the pages of a document to the selected level.
 * The block is collapsed when no document is open. The row state is read again inside the building update, so a second click adds nothing twice.
 */
export function OpenDocumentsPane({ file, update, rows, levelId, onNotice, children }: OpenDocumentsPaneProps) {
  const lastAddAt = useRef(0);
  const [expanded, setExpanded] = useState(() => rows.length > 0);
  const target = file.levels.find((level) => level.id === levelId) ?? file.levels[0] ?? null;

  async function put(row: OpenDocumentRow, toLevelId: string, pageIndexes: readonly number[], move: boolean) {
    if (Date.now() - lastAddAt.current < CLICK_GUARD_MS) return;
    lastAddAt.current = Date.now();
    let added = 0;
    let moved = 0;
    let levelName = '';
    await update((f) => {
      const result = addOpenDocumentPages(f, row, toLevelId, pageIndexes, move);
      added = result.added;
      moved = result.moved;
      levelName = f.levels.find((level) => level.id === toLevelId)?.name ?? '';
      return result.file;
    });
    const parts = [added > 0 ? `Added ${sheetsText(added)} to ${levelName}` : '', moved > 0 ? `Moved ${sheetsText(moved)} to ${levelName}` : ''].filter(
      (part) => part !== '',
    );
    if (parts.length > 0) onNotice(`${row.displayName}: ${parts.join('. ')}.`, false);
  }

  async function putAll(toLevelId: string, toLevelName: string) {
    if (Date.now() - lastAddAt.current < CLICK_GUARD_MS) return;
    lastAddAt.current = Date.now();
    let added = 0;
    await update((f) => {
      let next = f;
      added = 0;
      for (const row of rows) {
        const result = addOpenDocumentPages(next, row, toLevelId, row.pages.map((page) => page.pageIndex), false);
        next = result.file;
        added += result.added;
      }
      return next;
    });
    if (added > 0) onNotice(`Added ${sheetsText(added)} to ${toLevelName}.`, false);
  }

  function allPages(row: OpenDocumentRow): number[] {
    return row.pages.map((page) => page.pageIndex);
  }

  if (target === null) {
    return (
      <BuildingSection quiet title="Add files" testId="open-documents">
        {children}
        <div className="mep-buildings-actions">
          <p className="mep-hint" data-testid="open-doc-no-level">
            Add a level first. Then you can add the open documents to it.
          </p>
          <button
            type="button"
            data-testid="open-doc-add-level"
            onClick={() => void update((f) => addLevel(f, defaultLevelName(f), nextLevelElevation(f)))}
          >
            Add level
          </button>
        </div>
      </BuildingSection>
    );
  }

  const unplacedTotal = rows.reduce((sum, row) => sum + row.pages.filter((page) => page.sheet === null).length, 0);

  return (
    <BuildingSection quiet title="Add files" testId="open-documents">
      {children}
      <div className="mep-open-docs-bar">
        <button
          type="button"
          className="mep-open-docs-toggle"
          data-testid="open-docs-toggle"
          aria-expanded={expanded}
          aria-controls="mep-open-docs-list"
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> Open in the viewer ({rows.length})
        </button>
        {expanded && rows.length > 1 && (
          <button
            type="button"
            data-testid="open-doc-add-all-docs"
            disabled={unplacedTotal === 0}
            title={unplacedTotal === 0 ? 'Every page of the open documents is already a sheet.' : undefined}
            onClick={() => void putAll(target.id, target.name)}
          >
            Add all open documents to {target.name}
          </button>
        )}
      </div>
      {expanded && (
        <div id="mep-open-docs-list" className="mep-open-docs-list">
          {rows.length === 0 && <p className="mep-hint">No documents are open in the viewer.</p>}
          {rows.map((row) => {
            const multi = row.doc.pageCount > 1;
            const unplaced = row.pages.filter((page) => page.sheet === null).length;
            const elsewhere = row.pages.filter((page) => page.sheet !== null && page.sheet.levelId !== target.id).length;
            const otherLevels = file.levels.filter((level) => level.id !== target.id);
            const single = row.pages[0];
            let primary: string;
            let primaryDisabled = false;
            if (multi) {
              if (unplaced > 0) primary = 'Add all pages';
              else if (elsewhere > 0) primary = `Move all pages to ${target.name}`;
              else {
                primary = 'All pages added';
                primaryDisabled = true;
              }
            } else if (single?.sheet === null) primary = `Add to ${target.name}`;
            else if (single !== undefined && single.sheet.levelId !== target.id) primary = `Move to ${target.name}`;
            else {
              primary = `Added`;
              primaryDisabled = true;
            }
            return (
              <div key={row.doc.id} className="mep-open-doc" data-testid="open-doc-row" data-state={row.state}>
                <div className="mep-open-doc-head">
                  <b title={row.displayName}>{row.displayName}</b>
                  {row.doc.active && (
                    <span className="mep-open-doc-active" data-testid="open-doc-active" title="This document is on screen now.">
                      Active
                    </span>
                  )}
                  {!multi && <span className="mep-hint">1 page</span>}
                  <span data-testid="open-doc-placed">{placedText(row)}</span>
                  <button
                    type="button"
                    className="mep-open-doc-primary"
                    data-testid="open-doc-add"
                    disabled={primaryDisabled}
                    aria-label={`${primary} - ${row.displayName}`}
                    onClick={() => void put(row, target.id, allPages(row), !multi || unplaced === 0)}
                  >
                    {primary}
                  </button>
                  {otherLevels.length > 0 && (
                    <select
                      data-testid="open-doc-level"
                      aria-label={`${unplaced === 0 ? 'Move' : 'Add'} ${row.displayName} to another level`}
                      value=""
                      onChange={(event) => {
                        const id = event.target.value;
                        if (id !== '') void put(row, id, allPages(row), !multi || unplaced === 0);
                      }}
                    >
                      <option value="">{unplaced === 0 ? 'Move to…' : 'Add to another level…'}</option>
                      {otherLevels.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {multi && (
                  <div className="mep-open-doc-pages" data-testid="open-doc-pages">
                    <span className="mep-hint">Pages:</span>
                    {row.pages.map((page) => {
                      const onTarget = page.sheet !== null && page.sheet.levelId === target.id;
                      const label = page.sheet === null ? `p${page.pageIndex + 1}` : `p${page.pageIndex + 1}: ${page.levelName ?? 'Placed'}`;
                      const action = page.sheet === null ? `Add page ${page.pageIndex + 1} to ${target.name}` : onTarget ? `Page ${page.pageIndex + 1} is on ${target.name}` : `Move page ${page.pageIndex + 1} to ${target.name}`;
                      return (
                        <button
                          key={page.pageIndex}
                          type="button"
                          className={onTarget ? 'mep-open-doc-chip on' : 'mep-open-doc-chip'}
                          data-testid="open-doc-page-chip"
                          data-placed={page.sheet !== null ? 'true' : 'false'}
                          disabled={onTarget}
                          title={action}
                          aria-label={`${action} - ${row.displayName}`}
                          onClick={() => void put(row, target.id, [page.pageIndex], true)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {row.needsSave && (
                  <p className="mep-hint mep-open-doc-note" data-testid="open-doc-note">
                    Save it to link it.{row.path === undefined ? ' It has no file path yet, so the sheet cannot open the file later.' : ''}
                  </p>
                )}
                {row.doc.isDirty && (
                  <p className="mep-hint mep-open-doc-note" data-testid="open-doc-dirty">
                    Unsaved changes. The summary updates when you save.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BuildingSection>
  );
}
