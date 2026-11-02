import { useEffect, useRef, useState } from 'react';
import type { BuildingFile, BuildingSheet } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { Dialog } from './Dialog.js';
import type { UseBuilding } from '../useBuilding.js';
import { countLabel, sheetCount } from '../buildingLevels.js';
import { loadBuildings, loadImportedOldIds, pendingOldBuildings } from '../buildings.js';
import {
  buildingKey,
  buildTreeNodes,
  buildingWarnings,
  initialSelection,
  levelKey,
  NOT_PLACED_KEY,
  warningLines,
  type TreeNode,
} from '../buildingTree.js';
import { BuildingLevelsPane } from './BuildingLevelsPane.js';
import { BuildingMenu } from './BuildingMenu.js';
import { BuildingSheetsPane } from './BuildingSheetsPane.js';
import { BuildingSummariesPane, type BuildingSummariesPaneProps } from './BuildingSummariesPane.js';
import { BuildingTree } from './BuildingTree.js';

/** The result of opening a sheet. A null message means the user cancelled the file picker. */
export type SheetOpenResult = { ok: true } | { ok: false; message: string | null };

const NARROW_QUERY = '(max-width: 899px)';

function importResultText(total: number, result: { saved: number; cancelled: number; failed: string[] }): string {
  return (
    `Imported ${result.saved} of ${total}. ` +
    (result.cancelled > 0 ? `${result.cancelled} skipped. ` : '') +
    (result.failed.length > 0 ? `Could not import: ${result.failed.join('; ')}. ` : '') +
    (result.saved > 0 ? 'Open them from the list of buildings.' : '')
  );
}

/** True below 900 px. The tree gives way to a select. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/** The selected key. Falls back to the building key when the selected level or the Not placed node no longer exists. */
function resolveSelectedKey(key: string, file: BuildingFile | null, notPlaced: number): string {
  if (file === null) return '';
  if (key === buildingKey(file.id)) return key;
  if (key === NOT_PLACED_KEY) return notPlaced > 0 ? key : buildingKey(file.id);
  if (file.levels.some((level) => levelKey(level.id) === key)) return key;
  return buildingKey(file.id);
}

/** The focus key. Falls back to the selected key, then to the first node, when the focus key is not in the tree. */
function resolveFocusKey(focusKey: string, selected: string, nodes: TreeNode[]): string {
  if (nodes.some((node) => node.key === focusKey)) return focusKey;
  if (nodes.some((node) => node.key === selected)) return selected;
  return nodes[0]?.key ?? '';
}

export interface ManageBuildingsDialogProps {
  building: UseBuilding & { available: boolean };
  onClose: () => void;
  fileAccess: FileAccess;
  pdfEngine?: PdfEngine;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  onRebuildSummaries?: BuildingSummariesPaneProps['onRebuild'];
  activeSheetLevelId?: string | null;
}

/**
 * Manage Buildings: creates, opens and closes the one open building file.
 * The building file is stored by the platform (a file picker on desktop).
 */
export function ManageBuildingsDialog({
  building,
  onClose,
  fileAccess,
  pdfEngine,
  onOpenSheet,
  onRebuildSummaries,
  activeSheetLevelId,
}: ManageBuildingsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [oldPending, setOldPending] = useState(() => pendingOldBuildings(loadBuildings(), loadImportedOldIds()));
  const [importResult, setImportResult] = useState<string | null>(null);
  const openedFileId = building.building?.file.id ?? null;
  const openedIdRef = useRef<string | null>(openedFileId);
  const initialKey = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [notPlaced, setNotPlaced] = useState(0);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [focusKey, setFocusKey] = useState(initialKey);
  const narrow = useNarrow();

  useEffect(() => {
    if (openedFileId === openedIdRef.current) return;
    openedIdRef.current = openedFileId;
    const key = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
    setSelectedKey(key);
    setFocusKey(key);
    setCollapsed(new Set());
    setNotPlaced(0);
  }, [openedFileId]);

  function handleCreate() {
    if (building.busy) return;
    void building.create(name);
    setCreating(false);
    setName('');
  }

  async function handleImportOld() {
    if (building.busy) return;
    const total = oldPending.length;
    const result = await building.importOldBuildings(oldPending);
    setOldPending(pendingOldBuildings(loadBuildings(), loadImportedOldIds()));
    setImportResult(importResultText(total, result));
  }

  if (!building.available) {
    return (
      <Dialog title="Manage Buildings" onClose={onClose} closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
        <p>Building files are not available in this version of the app. Use the desktop app.</p>
      </Dialog>
    );
  }

  const openBuilding = building.building;
  const nodes = buildTreeNodes({
    recent: building.recent,
    open: openBuilding ? { file: openBuilding.file, location: openBuilding.ref.location } : null,
    sheetStatus: openBuilding?.sheetStatus ?? {},
    notPlacedCount: notPlaced,
    collapsed,
  });
  const selected = resolveSelectedKey(selectedKey, openBuilding?.file ?? null, notPlaced);
  const focus = resolveFocusKey(focusKey, selected, nodes);
  const selectedNode = nodes.find((node) => node.key === selected) ?? null;
  const selectedLevel = openBuilding?.file.levels.find((level) => levelKey(level.id) === selected) ?? null;
  const warnings = openBuilding ? buildingWarnings(openBuilding.file, openBuilding.sheetStatus) : null;
  const warningText = warnings !== null ? warningLines(warnings) : [];

  function onActivate(node: TreeNode) {
    if (building.busy) return;
    if (node.kind === 'building' && !node.isOpen) {
      void building.openRecent(node.entry!);
      setFocusKey(node.key);
      return;
    }
    setSelectedKey(node.key);
    setFocusKey(node.key);
  }

  function onToggle(key: string, expand: boolean) {
    setCollapsed((set) => {
      const next = new Set(set);
      if (expand) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!expand && selected !== key) setSelectedKey(key);
  }

  function onForget(node: TreeNode) {
    building.forgetRecent(node.entry!.id);
  }

  const header = (
    <div className="mep-buildings-header">
      <div className="mep-buildings-header-top">
        <h3 className="mep-modal-title">Manage Buildings</h3>
        <BuildingMenu
          busy={building.busy}
          hasBuilding={openBuilding !== null}
          importLabel={oldPending.length > 0 ? `Import ${countLabel(oldPending.length, 'old building')}` : null}
          onNew={() => setCreating(true)}
          onOpen={() => void building.open()}
          onClose={() => building.close()}
          onImport={() => void handleImportOld()}
        />
      </div>
      {openBuilding && (
        <div className="mep-buildings-header-info">
          <p className="mep-buildings-open-name">{openBuilding.file.name}</p>
          <p className="mep-hint mep-buildings-location" title={openBuilding.ref.location}>
            {openBuilding.ref.location}
          </p>
          <p className="mep-buildings-counts">
            {countLabel(openBuilding.file.levels.length, 'level')}, {countLabel(openBuilding.file.sheets.length, 'sheet')}
          </p>
          {warnings !== null && warnings.total > 0 && (
            <span className="mep-buildings-badge" role="status" data-testid="warnings-badge" title={warningText.join('\n')}>
              {countLabel(warnings.total, 'warning')}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      title="Manage Buildings"
      onClose={onClose}
      closeOnBackdropClick={false}
      className="mep-modal--buildings"
      header={header}
      actions={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="mep-buildings-layout">
        <nav className="mep-buildings-nav" aria-label="Buildings">
          {narrow ? (
            <select
              aria-label="Building or level"
              className="mep-buildings-select"
              autoFocus
              value={nodes.some((node) => node.key === selected) ? selected : ''}
              onChange={(event) => {
                const node = nodes.find((item) => item.key === event.target.value);
                if (node) onActivate(node);
              }}
            >
              {!nodes.some((node) => node.key === selected) && (
                <option value="" disabled>
                  Choose a building or level
                </option>
              )}
              {nodes.map((node) => (
                <option key={node.key} value={node.key}>
                  {(node.depth === 2 ? '   ' : '') +
                    node.label +
                    (node.isOpen ? ' (open)' : '') +
                    (node.kind === 'level' ? ` - ${node.detail}` : '')}
                </option>
              ))}
            </select>
          ) : (
            <BuildingTree
              nodes={nodes}
              selectedKey={selected}
              focusKey={focus}
              onFocusKey={setFocusKey}
              onActivate={onActivate}
              onToggle={onToggle}
              onForget={onForget}
              autoFocus={nodes.length > 0}
            />
          )}
        </nav>

        <section className="mep-buildings-detail">
          {building.message && (
            <p className="mep-hint mep-buildings-message" role="alert">
              {building.message} <button type="button" onClick={() => building.dismissMessage()}>Dismiss</button>
            </p>
          )}

          {(oldPending.length > 0 || importResult !== null) && (
            <div className="mep-buildings-strip" data-testid="import-old">
              {oldPending.length > 0 && (
                <p className="mep-hint">
                  {countLabel(oldPending.length, 'old building')} can be imported. Open the Building menu and choose Import. MepApp asks
                  where to save each building file. The old list stays unchanged.
                </p>
              )}
              {importResult !== null && (
                <p className="mep-hint" data-testid="import-old-result">
                  {importResult}
                </p>
              )}
            </div>
          )}

          {creating && (
            <div className="mep-buildings-create">
              <input
                placeholder="Building name (default: New building)"
                aria-label="Building name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate();
                }}
              />
              <button type="button" disabled={building.busy} onClick={handleCreate}>
                Create…
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setName('');
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {!openBuilding && (
            <div className="mep-buildings-empty">
              <p className="mep-hint">No building is open. Create a building or open a building file.</p>
              <div className="mep-buildings-actions">
                {!creating && (
                  <button
                    type="button"
                    disabled={building.busy}
                    autoFocus={nodes.length === 0}
                    onClick={() => setCreating(true)}
                  >
                    New building
                  </button>
                )}
                <button type="button" disabled={building.busy} onClick={() => void building.open()}>
                  Open building…
                </button>
              </div>
            </div>
          )}

          {openBuilding && (
            <>
              {/* B4 adds a Risers tab here */}
              <div role="tablist" className="mep-buildings-tabs">
                <button
                  type="button"
                  role="tab"
                  id="mep-buildings-tab-levels"
                  aria-selected="true"
                  aria-controls="mep-buildings-panel-levels"
                  className="mep-buildings-tab on"
                >
                  Levels and sheets
                </button>
              </div>
              <div
                role="tabpanel"
                id="mep-buildings-panel-levels"
                aria-labelledby="mep-buildings-tab-levels"
                className="mep-buildings-panel"
              >
                <div className="mep-section" data-testid="selection-summary">
                  {selectedLevel !== null ? (
                    <>
                      <h4>{selectedLevel.name}</h4>
                      <p>
                        Elevation {selectedLevel.elevationMm} mm, {countLabel(sheetCount(openBuilding.file, selectedLevel.id), 'sheet')}.
                      </p>
                      {selectedNode?.warning && (
                        <p className="mep-hint mep-buildings-message">A sheet of this level has a missing PDF or no access.</p>
                      )}
                    </>
                  ) : (
                    <>
                      <h4>Building summary</h4>
                      {warningText.length > 0 ? (
                        warningText.map((line) => (
                          <p key={line} className="mep-hint mep-buildings-message">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="mep-hint">No warnings.</p>
                      )}
                    </>
                  )}
                  {selected === NOT_PLACED_KEY && <p className="mep-hint">Pages without a level are kept only while this dialog is open.</p>}
                </div>
                {/* T11d replaces this pane */}
                <BuildingLevelsPane file={openBuilding.file} update={building.update} selectedLevelId={selectedLevel?.id ?? null} />
                {/* T11h replaces this pane */}
                <BuildingSummariesPane
                  key={`${openBuilding.file.id}-summaries`}
                  hasSheets={openBuilding.file.sheets.length > 0}
                  onRebuild={pdfEngine === undefined ? undefined : onRebuildSummaries}
                  onDone={() => void building.refreshSheetStatus()}
                />
                {/* T11e and T11g replace this pane */}
                <BuildingSheetsPane
                  key={openBuilding.file.id}
                  file={openBuilding.file}
                  update={building.update}
                  fileAccess={fileAccess}
                  engine={pdfEngine}
                  onOpenSheet={async (sheet, mode) => {
                    const result = await onOpenSheet(sheet, mode);
                    if (result.ok) onClose();
                    return result;
                  }}
                  sheetStatus={openBuilding.sheetStatus}
                  sheetSummary={openBuilding.sheetSummary}
                  onRefreshStatus={building.refreshSheetStatus}
                  onPendingCountChange={setNotPlaced}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
