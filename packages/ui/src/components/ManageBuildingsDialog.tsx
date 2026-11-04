import { useEffect, useRef, useState } from 'react';
import { addLevel, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess } from '@mepapp/platform';
import { Dialog } from './Dialog.js';
import type { UseBuilding } from '../useBuilding.js';
import { countLabel, defaultLevelName, nextLevelElevation, sheetCount } from '../buildingLevels.js';
import { notPlacedAskText, sheetsWithoutSummary } from '../buildingStatus.js';
import { useSheetRelink } from '../useSheetRelink.js';
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
import { BuildingSheetsPane, usePendingPdfs } from './BuildingSheetsPane.js';
import { BuildingSummariesPane, type BuildingSummariesPaneProps } from './BuildingSummariesPane.js';
import { BuildingTree } from './BuildingTree.js';
import { LevelSheetsPane } from './LevelSheetsPane.js';
import { NotPlacedPane } from './NotPlacedPane.js';
import { OpenDocumentsPane } from './OpenDocumentsPane.js';
import type { OpenDocumentRow } from '../openDocumentsView.js';

/** The result of opening a sheet. A null message means the user cancelled the file picker. */
export type SheetOpenResult = { ok: true } | { ok: false; message: string | null };

type AskKind = 'close' | 'switch';

/** An action that waits for the answer to the question about the pages that are not placed. */
interface PendingAsk {
  kind: AskKind;
  run: () => void;
}

const ASK_BUTTON: Record<AskKind, string> = {
  close: 'Close anyway',
  switch: 'Switch building',
};

const NARROW_QUERY = '(max-width: 899px)';

/** The time a notice stays in the status line. An error stays longer. */
const NOTICE_MS = 6000;
const NOTICE_ERROR_MS = 12000;

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
  /** The documents open in the viewer, one row each (openDocumentRows). */
  openDocuments?: readonly OpenDocumentRow[];
}

/**
 * Manage Buildings: creates and opens the one open building file.
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
  openDocuments = [],
}: ManageBuildingsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [oldPending, setOldPending] = useState(() => pendingOldBuildings(loadBuildings(), loadImportedOldIds()));
  const [importResult, setImportResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean; id: number } | null>(null);
  const noticeCount = useRef(0);
  const [ask, setAsk] = useState<PendingAsk | null>(null);
  const openedFileId = building.building?.file.id ?? null;
  const openedIdRef = useRef<string | null>(openedFileId);
  const initialKey = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [focusKey, setFocusKey] = useState(initialKey);
  const [focusNameLevelId, setFocusNameLevelId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const narrow = useNarrow();
  const pendingPdfs = usePendingPdfs(building.building?.file ?? null);
  const notPlaced = pendingPdfs.waitingPages;

  useEffect(() => {
    if (openedFileId === openedIdRef.current) return;
    openedIdRef.current = openedFileId;
    const key = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
    setSelectedKey(key);
    setFocusKey(key);
    setCollapsed(new Set());
    setNotice(null);
    setAsk(null);
    setCreating(false);
    setName('');
  }, [openedFileId]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), notice.error ? NOTICE_ERROR_MS : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice?.id]);

  useEffect(() => {
    if (notPlaced === 0) setAsk(null);
  }, [notPlaced]);

  const refreshRef = useRef(building.refreshSheetStatus);
  refreshRef.current = building.refreshSheetStatus;
  const hasBuilding = openedFileId !== null;
  useEffect(() => {
    if (!hasBuilding) return;
    const onFocus = () => void refreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [hasBuilding]);

  const relinker = useSheetRelink({ file: building.building?.file ?? null, update: building.update, fileAccess, engine: pdfEngine, onNotice });

  function onNotice(text: string, error: boolean) {
    noticeCount.current += 1;
    setNotice({ text, error, id: noticeCount.current });
  }

  /** Runs the action. With pages that have no level the dialog asks first, because the action drops them. */
  function guard(kind: AskKind, run: () => void) {
    if (notPlaced === 0) {
      run();
      return;
    }
    setAsk({ kind, run });
  }

  /** Moves the focus into the navigation after the question closes, so the focus does not fall to the body. */
  function focusNav() {
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"], select')?.focus());
  }

  /** Close button, Escape. A second Escape answers "Keep working". */
  function requestClose() {
    if (ask !== null) {
      setAsk(null);
      focusNav();
      return;
    }
    guard('close', onClose);
  }

  /** The open action of the sheet rows. The dialog stays open, so the user can open more sheets. */
  async function openSheetKeepOpen(sheet: BuildingSheet, mode: 'path' | 'pick'): Promise<SheetOpenResult> {
    const result = await onOpenSheet(sheet, mode);
    if (result.ok) onNotice(`Opened ${sheet.displayName} in the viewer.`, false);
    return result;
  }

  function handleCreate() {
    if (building.busy) return;
    guard('switch', () => {
      void building.create(name);
      setCreating(false);
      setName('');
    });
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
      guard('switch', () => {
        void building.openRecent(node.entry!);
        setFocusKey(node.key);
      });
      return;
    }
    if (node.kind === 'add-level') {
      if (openBuilding === null) return;
      const id = crypto.randomUUID();
      void building.update((f) => addLevel(f, defaultLevelName(f), nextLevelElevation(f), id));
      setSelectedKey(levelKey(id));
      setFocusKey(levelKey(id));
      setFocusNameLevelId(id);
      return;
    }
    setSelectedKey(node.key);
    setFocusKey(node.key);
  }

  function onSelectKey(key: string) {
    setSelectedKey(key);
    setFocusKey(key);
    focusNav();
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
          importLabel={oldPending.length > 0 ? `Import ${countLabel(oldPending.length, 'old building')}` : null}
          onNew={() => setCreating(true)}
          onOpen={() => guard('switch', () => void building.open())}
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
      onClose={requestClose}
      closeOnBackdropClick={false}
      className="mep-modal--buildings"
      header={header}
      actions={
        ask !== null && notPlaced > 0 ? (
          <div className="mep-buildings-close-ask" role="alert" data-testid="close-ask">
            <span>{notPlacedAskText(ask.kind, notPlaced)}</span>
            <button
              type="button"
              data-testid="close-anyway"
              onClick={() => {
                setAsk(null);
                focusNav();
                ask.run();
              }}
            >
              {ASK_BUTTON[ask.kind]}
            </button>
            <button
              type="button"
              data-testid="keep-working"
              autoFocus
              onClick={() => {
                setAsk(null);
                focusNav();
              }}
            >
              Keep working
            </button>
          </div>
        ) : (
          <button type="button" onClick={requestClose}>
            Close
          </button>
        )
      }
    >
      <div className="mep-buildings-layout">
        <nav ref={navRef} className="mep-buildings-nav" aria-label="Buildings">
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
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreate();
                  }
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
                  setAsk((current) => (current?.kind === 'switch' ? null : current));
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
              <BuildingSummariesPane
                key={`${openBuilding.file.id}-summaries`}
                missing={sheetsWithoutSummary(openBuilding.file.sheets, openBuilding.sheetStatus, openBuilding.sheetSummary).length}
                onRebuild={pdfEngine === undefined ? undefined : onRebuildSummaries}
                onDone={() => void building.refreshSheetStatus()}
                fileAccess={fileAccess}
                relinker={relinker}
                sheetStatus={openBuilding.sheetStatus}
                onOpenSheet={openSheetKeepOpen}
                onNotice={onNotice}
              />
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
                {selected === NOT_PLACED_KEY && (
                  <NotPlacedPane
                    file={openBuilding.file}
                    update={building.update}
                    waiting={pendingPdfs.waiting}
                    totals={pendingPdfs.totals}
                    onRemove={pendingPdfs.remove}
                  />
                )}
                <div className="mep-section" data-testid="selection-summary">
                  {selectedLevel !== null ? (
                    <>
                      <h4>{selectedLevel.name}</h4>
                      <p>{countLabel(sheetCount(openBuilding.file, selectedLevel.id), 'sheet')}.</p>
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
                </div>
                <LevelSheetsPane
                  key={`${openBuilding.file.id}-level-sheets-${selectedLevel?.id ?? 'all'}`}
                  file={openBuilding.file}
                  update={building.update}
                  fileAccess={fileAccess}
                  levelId={selectedLevel?.id ?? null}
                  onOpenSheet={openSheetKeepOpen}
                  relinker={relinker}
                  sheetStatus={openBuilding.sheetStatus}
                  sheetSummary={openBuilding.sheetSummary}
                  onRefreshStatus={building.refreshSheetStatus}
                  onNotice={onNotice}
                />
                <OpenDocumentsPane
                  file={openBuilding.file}
                  update={building.update}
                  rows={openDocuments}
                  levelId={selectedLevel?.id ?? null}
                  onNotice={onNotice}
                >
                  <BuildingSheetsPane
                    key={openBuilding.file.id}
                    fileAccess={fileAccess}
                    engine={pdfEngine}
                    pendingPdfs={pendingPdfs}
                    file={openBuilding.file}
                    update={building.update}
                    levelId={selectedLevel?.id ?? null}
                    onRefreshStatus={building.refreshSheetStatus}
                    onAdded={() => {
                      setSelectedKey(NOT_PLACED_KEY);
                      setFocusKey(NOT_PLACED_KEY);
                    }}
                    onNotice={onNotice}
                  />
                </OpenDocumentsPane>
                <BuildingLevelsPane
                  key={`${openBuilding.file.id}-levels`}
                  file={openBuilding.file}
                  update={building.update}
                  selectedLevelId={selectedLevel?.id ?? null}
                  focusNameLevelId={focusNameLevelId}
                  onNameFocused={() => setFocusNameLevelId(null)}
                  onSelectKey={onSelectKey}
                />
              </div>
              <div className="mep-buildings-status-line">
                {notice !== null && (
                  <p
                    key={notice.id}
                    className={notice.error ? 'mep-buildings-status mep-buildings-status--error' : 'mep-buildings-status'}
                    role="status"
                    data-testid="sheets-notice"
                  >
                    {notice.text}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
}
