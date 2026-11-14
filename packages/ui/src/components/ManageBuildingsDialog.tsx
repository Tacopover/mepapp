import { useEffect, useRef, useState } from 'react';
import { addLevel, renameBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { FileAccess, OpenedFile } from '@mepapp/platform';
import { Dialog } from './Dialog.js';
import type { UseBuilding } from '../useBuilding.js';
import { countLabel, defaultLevelName, nextLevelElevation } from '../buildingLevels.js';
import { sheetsWithoutSummary } from '../buildingStatus.js';
import { useSheetRelink } from '../useSheetRelink.js';
import { loadBuildings, loadImportedOldIds, pendingOldBuildings } from '../buildings.js';
import {
  accessCardText,
  allowAccessLabel,
  BLOCKED_STORAGE,
  BROWSER_STORAGE_ALERT,
  createButtonLabel,
  importHint,
  NEEDS_ACCESS_HINT,
  openHint,
} from '../buildingStorageText.js';
import {
  buildingKey,
  buildTreeNodes,
  buildingWarnings,
  duplicateBuildingNameWarning,
  initialSelection,
  levelKey,
  warningLines,
  type TreeNode,
} from '../buildingTree.js';
import { BuildingLevelsPane } from './BuildingLevelsPane.js';
import { BuildingMenu } from './BuildingMenu.js';
import { BuildingNameEditor } from './BuildingNameEditor.js';
import { BuildingRisersPane } from './BuildingRisersPane.js';
import { BuildingSheetsPane } from './BuildingSheetsPane.js';
import { BuildingSummariesPane, type BuildingSummariesPaneProps } from './BuildingSummariesPane.js';
import { BuildingTree } from './BuildingTree.js';
import { LevelSheetsPane } from './LevelSheetsPane.js';
import { OpenDocumentsPane } from './OpenDocumentsPane.js';
import { openedSheetIds, type OpenDocumentRow } from '../openDocumentsView.js';

export interface SheetNotice { text: string; error: boolean }

/** The result of opening a sheet. A null message means the user cancelled the file picker, and the three panes stay silent. The notice, when set, is shown by the dialog. */
export type SheetOpenResult = { ok: true; notice?: SheetNotice } | { ok: false; message: string | null; notice?: SheetNotice };

const NARROW_QUERY = '(max-width: 899px)';

/** The time a notice stays in the status line. An error stays longer. */
const NOTICE_MS = 6000;
const NOTICE_ERROR_MS = 12000;

type BuildingTab = 'levels' | 'risers';
const BUILDING_TABS: readonly BuildingTab[] = ['levels', 'risers'];
const NO_RISER_CONFLICTS: ReadonlySet<string> = new Set<string>();

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

/** The selected key. Falls back to the building key when the selected level no longer exists. */
function resolveSelectedKey(key: string, file: BuildingFile | null): string {
  if (file === null) return '';
  if (key === buildingKey(file.id)) return key;
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
  sheetFiles?: {
    remember: (opened: OpenedFile[]) => void;
    has: (sheet: BuildingSheet) => boolean;
    isAmbiguous: (sheet: BuildingSheet) => boolean;
  };
  riserConflictKeys?: ReadonlySet<string>;
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
  sheetFiles,
  riserConflictKeys = NO_RISER_CONFLICTS,
}: ManageBuildingsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [oldPending, setOldPending] = useState(() => pendingOldBuildings(loadBuildings(), loadImportedOldIds()));
  const [importResult, setImportResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean; id: number } | null>(null);
  const noticeCount = useRef(0);
  const openedFileId = building.building?.file.id ?? null;
  const openedIdRef = useRef<string | null>(openedFileId);
  const initialKey = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(() => new Set());
  const [highlight, setHighlight] = useState<{ sheetId: string; seq: number } | null>(null);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [focusKey, setFocusKey] = useState(initialKey);
  const [focusNameLevelId, setFocusNameLevelId] = useState<string | null>(null);
  const [tab, setTab] = useState<BuildingTab>('levels');
  const navRef = useRef<HTMLElement | null>(null);
  const narrow = useNarrow();

  useEffect(() => {
    if (openedFileId === openedIdRef.current) return;
    openedIdRef.current = openedFileId;
    const key = building.building ? initialSelection(building.building.file, activeSheetLevelId ?? null) : '';
    setSelectedKey(key);
    setFocusKey(key);
    setCollapsed(new Set());
    setExpandedLevels(new Set());
    setHighlight(null);
    setNotice(null);
    setCreating(false);
    setName('');
    setTab('levels');
  }, [openedFileId]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), notice.error ? NOTICE_ERROR_MS : NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice?.id]);

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

  /** Moves the focus into the navigation after a selection, so the focus does not fall to the body. */
  function focusNav() {
    requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"], select')?.focus());
  }

  /** Shows a tab and moves the focus to its button, so the keyboard focus follows the selection. */
  function selectTab(next: BuildingTab) {
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`mep-buildings-tab-${next}`)?.focus());
  }

  /** The open action of the sheet rows. The dialog stays open, so the user can open more sheets. */
  async function openSheetKeepOpen(sheet: BuildingSheet, mode: 'path' | 'pick'): Promise<SheetOpenResult> {
    const result = await onOpenSheet(sheet, mode);
    if (result.ok) onNotice(`Opened ${sheet.displayName} in the viewer.${result.notice !== undefined ? ` ${result.notice.text}` : ''}`, result.notice?.error === true);
    else if (result.notice !== undefined) onNotice(result.notice.text, result.notice.error);
    return result;
  }

  function handleCreate() {
    if (building.busy) return;
    void building.create(name);
    setCreating(false);
    setName('');
  }

  async function handleSaveCopy() {
    if (building.busy) return;
    const name = await building.saveCopy();
    if (name) onNotice(`Saved a copy as ${name}.`, false);
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
        <p>{building.storage === 'blocked' ? BLOCKED_STORAGE : 'Building files are not available in this version of the app. Use the desktop app.'}</p>
      </Dialog>
    );
  }

  const openBuilding = building.building;
  const needsAccess = building.needsAccess;
  const nodes = buildTreeNodes({
    recent: building.recent,
    open: openBuilding ? { file: openBuilding.file, location: openBuilding.ref.location } : null,
    sheetStatus: openBuilding?.sheetStatus ?? {},
    collapsed,
    expandedLevels,
  }).map((node) =>
    node.kind === 'building' && node.entry !== null && needsAccess !== null && node.entry.id === needsAccess.entry.id
      ? { ...node, detail: NEEDS_ACCESS_HINT }
      : node,
  );
  const hint = openHint(building.storage);
  const card = needsAccess === null ? null : accessCardText(needsAccess.denied);
  const accessCard =
    needsAccess === null || card === null ? null : (
      <div className="mep-buildings-access" data-testid="access-card">
        <h4>{needsAccess.entry.name}</h4>
        {card.denied !== null && (
          <p role="alert" data-testid="access-denied">
            {card.denied}
          </p>
        )}
        <p>{card.line}</p>
        <button
          type="button"
          className="primary"
          data-testid="allow-access"
          autoFocus
          disabled={building.busy}
          onClick={() => void building.allowAccess()}
        >
          {allowAccessLabel(building.busy)}
        </button>
      </div>
    );
  const selected = resolveSelectedKey(selectedKey, openBuilding?.file ?? null);
  const focus = resolveFocusKey(focusKey, selected, nodes);
  const selectedNode = nodes.find((node) => node.key === selected) ?? null;
  const selectedLevel = openBuilding?.file.levels.find((level) => levelKey(level.id) === selected) ?? null;
  const warnings = openBuilding ? buildingWarnings(openBuilding.file, openBuilding.sheetStatus) : null;
  const warningText = warnings !== null ? warningLines(warnings) : [];
  const readableNoSummary = openBuilding ? sheetsWithoutSummary(openBuilding.file.sheets, openBuilding.sheetStatus, openBuilding.sheetSummary) : [];
  const noSummary = openBuilding
    ? openBuilding.file.sheets.filter((sheet) => !Object.prototype.hasOwnProperty.call(openBuilding.sheetSummary, sheet.id))
    : [];

  function onActivate(node: TreeNode) {
    if (building.busy) return;
    if (node.kind === 'sheet') {
      setSelectedKey(node.parentKey!);
      setFocusKey(node.key);
      setHighlight((current) => ({ sheetId: node.sheetId!, seq: (current?.seq ?? 0) + 1 }));
      return;
    }
    setHighlight(null);
    if (node.kind === 'building' && !node.isOpen) {
      void building.openRecent(node.entry!);
      setFocusKey(node.key);
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
    setHighlight(null);
    focusNav();
  }

  function onToggle(key: string, expand: boolean) {
    if (key.startsWith('l:')) {
      setExpandedLevels((set) => {
        const next = new Set(set);
        if (expand) next.add(key);
        else next.delete(key);
        return next;
      });
      return;
    }
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
          onOpen={() => void building.open()}
          onImport={() => void handleImportOld()}
          onSaveCopy={openBuilding !== null && building.storage === 'browser' ? () => void handleSaveCopy() : undefined}
          saveCopyDisabled={openBuilding === null}
        />
      </div>
      {openBuilding && (
        <div className="mep-buildings-header-info">
          <div className="mep-buildings-open-name">
            <BuildingNameEditor
              testId="building-name-header"
              name={openBuilding.file.name}
              onRename={(name) => void building.update((f) => renameBuilding(f, name))}
              warning={duplicateBuildingNameWarning(building.recent, openBuilding.file)}
            />
          </div>
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
              {nodes.filter((node) => node.kind !== 'sheet').map((node) => (
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
              onForget={building.storage === 'browser' ? undefined : onForget}
              autoFocus={nodes.length > 0}
            />
          )}
        </nav>

        <section className="mep-buildings-detail">
          {building.storage === 'browser' && (
            <p className="mep-hint mep-buildings-alert" role="status" data-testid="browser-storage-alert">
              {BROWSER_STORAGE_ALERT}
            </p>
          )}

          {building.message && (
            <p className="mep-hint mep-buildings-message" role="alert">
              {building.message} <button type="button" onClick={() => building.dismissMessage()}>Dismiss</button>
            </p>
          )}

          {openBuilding && accessCard}

          {(oldPending.length > 0 || importResult !== null) && (
            <div className="mep-buildings-strip" data-testid="import-old">
              {oldPending.length > 0 && <p className="mep-hint">{importHint(oldPending.length, building.storage)}</p>}
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
                {createButtonLabel(building.storage)}
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

          {!openBuilding && accessCard}

          {!openBuilding && (
            <div className="mep-buildings-empty">
              {accessCard === null && <p className="mep-hint">No building is open. Create a building or open a building file.</p>}
              {accessCard === null && hint !== null && <p className="mep-hint">{hint}</p>}
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
              <div
                role="tablist"
                aria-label="Building sections"
                className="mep-buildings-tabs"
                onKeyDown={(event) => {
                  const index = BUILDING_TABS.indexOf(tab);
                  let next: BuildingTab | null = null;
                  if (event.key === 'ArrowRight') next = BUILDING_TABS[(index + 1) % BUILDING_TABS.length];
                  else if (event.key === 'ArrowLeft') next = BUILDING_TABS[(index - 1 + BUILDING_TABS.length) % BUILDING_TABS.length];
                  else if (event.key === 'Home') next = BUILDING_TABS[0];
                  else if (event.key === 'End') next = BUILDING_TABS[BUILDING_TABS.length - 1];
                  if (next === null) return;
                  event.preventDefault();
                  selectTab(next);
                }}
              >
                <button
                  type="button"
                  role="tab"
                  id="mep-buildings-tab-levels"
                  aria-selected={tab === 'levels'}
                  aria-controls="mep-buildings-panel-levels"
                  tabIndex={tab === 'levels' ? 0 : -1}
                  className={tab === 'levels' ? 'mep-buildings-tab on' : 'mep-buildings-tab'}
                  onClick={() => setTab('levels')}
                >
                  Levels and sheets
                </button>
                <button
                  type="button"
                  role="tab"
                  id="mep-buildings-tab-risers"
                  aria-selected={tab === 'risers'}
                  aria-controls={tab === 'risers' ? 'mep-buildings-panel-risers' : undefined}
                  tabIndex={tab === 'risers' ? 0 : -1}
                  className={tab === 'risers' ? 'mep-buildings-tab on' : 'mep-buildings-tab'}
                  onClick={() => setTab('risers')}
                >
                  {`Risers (${openBuilding.file.risers.length})`}
                </button>
              </div>
              <div
                role="tabpanel"
                id="mep-buildings-panel-levels"
                aria-labelledby="mep-buildings-tab-levels"
                className="mep-buildings-panel"
                hidden={tab !== 'levels'}
              >
                <BuildingLevelsPane
                  key={`${openBuilding.file.id}-levels`}
                  file={openBuilding.file}
                  update={building.update}
                  selectedLevelId={selectedLevel?.id ?? null}
                  focusNameLevelId={focusNameLevelId}
                  onNameFocused={() => setFocusNameLevelId(null)}
                  onSelectKey={onSelectKey}
                  buildingWarningLines={warningText}
                  levelHasWarning={Boolean(selectedNode?.warning)}
                />
                <LevelSheetsPane
                  key={`${openBuilding.file.id}-level-sheets-${selectedLevel?.id ?? 'all'}`}
                  file={openBuilding.file}
                  update={building.update}
                  fileAccess={fileAccess}
                  levelId={selectedLevel?.id ?? null}
                  onOpenSheet={openSheetKeepOpen}
                  relinker={relinker}
                  highlight={highlight}
                  sheetStatus={openBuilding.sheetStatus}
                  sheetSummary={openBuilding.sheetSummary}
                  onRefreshStatus={building.refreshSheetStatus}
                  onNotice={onNotice}
                  openedSheetIds={openedSheetIds(openDocuments)}
                  canOpenCached={sheetFiles?.has}
                  rememberFiles={sheetFiles?.remember}
                  isAmbiguous={sheetFiles?.isAmbiguous}
                />
                <BuildingSummariesPane
                  key={`${openBuilding.file.id}-summaries`}
                  missing={readableNoSummary.length}
                  other={noSummary.length - readableNoSummary.length}
                  onRebuild={pdfEngine === undefined ? undefined : onRebuildSummaries}
                  onDone={() => void building.refreshSheetStatus()}
                  fileAccess={fileAccess}
                  relinker={relinker}
                  sheetStatus={openBuilding.sheetStatus}
                  onOpenSheet={openSheetKeepOpen}
                  onNotice={onNotice}
                  canOpenCached={sheetFiles?.has}
                />
                <OpenDocumentsPane
                  key={openBuilding.file.id}
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
                    file={openBuilding.file}
                    update={building.update}
                    levelId={selectedLevel?.id ?? null}
                    onRefreshStatus={building.refreshSheetStatus}
                    onNotice={onNotice}
                    onFilesRead={sheetFiles?.remember}
                  />
                </OpenDocumentsPane>
              </div>
              {tab === 'risers' && (
                <div
                  role="tabpanel"
                  id="mep-buildings-panel-risers"
                  aria-labelledby="mep-buildings-tab-risers"
                  className="mep-buildings-panel"
                  data-testid="risers-panel"
                >
                  <BuildingRisersPane
                    key={`${openBuilding.file.id}-risers`}
                    file={openBuilding.file}
                    update={building.update}
                    store={openBuilding.store}
                    conflictKeys={riserConflictKeys}
                    fileAccess={fileAccess}
                    onOpenSheet={openSheetKeepOpen}
                    openedSheetIds={openedSheetIds(openDocuments)}
                    canOpenCached={sheetFiles?.has}
                    onNotice={onNotice}
                    busy={building.busy}
                  />
                </div>
              )}
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
