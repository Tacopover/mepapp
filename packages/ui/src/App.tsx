import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  buildRoomExportTable,
  buildStampPropertyContext,
  DEFAULT_STAMP_LABEL_VISIBILITY,
  getStampDefinition,
  isLibraryStampId,
  SCHEMATIC_TEMPLATE_LIBRARY,
  calibrationFromScale,
  STAMP_LIBRARY,
  SAVED_STAMPS_SOURCE_ID,
  type Discipline,
  type NetworkType,
  type RoomDetectionClient,
  type ReconciliationReport,
  type SchematicSymbol,
  type SchematicTemplate,
  type StampCategory,
  type StampDefinition,
  type StampLabel,
  type StampLabelVisibility,
} from '@mepapp/core';
import { DEFAULT_SNAP_RADIUS_SCREEN_PX, DEFAULT_ANGLE_SNAP_DEGREES, isCircuitsTool, type PdfExportReceipt, type WallDebugState } from '@mepapp/render';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';
import { useSketchScene } from './useSketchScene.js';
import { WallDebugPanel } from './components/WallDebugPanel.js';
import { loadDefinitionBitmap } from './stampBitmap.js';
import { Rail } from './components/Rail.js';
import { CanvasContextMenu } from './components/CanvasContextMenu.js';
import { DockPanel, type DockTabDef } from './components/DockPanel.js';
import { classifyStampsForDelete, bulkDeleteMessage } from './stampBulkDelete.js';
import { StampsPanel, getVisibleStampDefinitions, pickStampDefinition } from './components/StampsPanel.js';
import type { StampLabelLanguage } from './components/LanguageToggle.js';
import type { StampCategoryFilter } from './components/CategorySwitcher.js';
import { useRoomSelection } from './useRoomSelection.js';
import { PropertiesPanel } from './components/PropertiesPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { ToastStack, useToasts } from './components/Toasts.js';
import { DrawingsPanel } from './components/DrawingsPanel.js';
import { useNetworkTreeState } from './useNetworkTreeState.js';
import { CircuitsToolbar } from './components/CircuitsToolbar.js';
import { NetworkTreePanel } from './components/NetworkTreePanel.js';
import { MenuButton } from './components/MenuButton.js';
import { roomTableToXlsx } from './roomExport.js';
import { DocumentSwitcher } from './components/DocumentSwitcher.js';
import { RoomToolBar } from './components/RoomToolBar.js';
import { Dialog } from './components/Dialog.js';
import { CalibrationDialog } from './components/CalibrationDialog.js';
import { SettingsDialog, MIN_SNAP_RADIUS_PX, MAX_SNAP_RADIUS_PX, MIN_ANGLE_SNAP_DEGREES, MAX_ANGLE_SNAP_DEGREES } from './components/SettingsDialog.js';
import { GlobalPropertiesDialog, type GlobalPropertyDefs, type GlobalPropertyRenames } from './components/GlobalPropertiesDialog.js';
import { ManageBuildingsDialog } from './components/ManageBuildingsDialog.js';
import { ElementEditorDialog } from './components/ElementEditorDialog.js';
import { StampLabelsDialog } from './components/StampLabelsDialog.js';
import { StampPickerDialog } from './components/StampPickerDialog.js';
import { CircuitTypesDialog } from './components/CircuitTypesDialog.js';
import { SchematicDialog } from './components/SchematicDialog.js';
import { NetworkTypeEditorDialog, type NetworkTypeEditPatch } from './components/NetworkTypeEditorDialog.js';
import { loadBuildings, saveBuildings, type Building } from './buildings.js';
import { loadCustomTemplates, saveCustomTemplates } from './schematicTemplateStorage.js';
import { loadCustomSymbols, saveCustomSymbols } from './schematicSymbolStorage.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { IconFlow } from './icons.js';
import type { DisciplineGroup } from './disciplineGroups.js';
import { useUserStampLibrary } from './useUserStampLibrary.js';
import {
  browserImageSizeDecoder,
  createLibrarySource,
  deleteSavedStamp,
  ensureReadPermission,
  saveUserStampAs,
  saveUserStampEdits,
  setUserStampHidden,
  showHiddenStamps,
  syncLibrarySource,
  userStampLabelTaken,
} from './userStampLibrary.js';
import { useShowBuiltInStamps } from './builtInStampsSetting.js';
import { LibrarySourceDialog } from './components/LibrarySourceDialog.js';
import { LibraryFoldersDialog } from './components/LibraryFoldersDialog.js';
import type { LibrarySourceRecord, LibraryStore } from '@mepapp/platform';
import './theme.css';

export interface PdfPageLoadResult {
  bitmap: ImageBitmap;
  pageWidthPt: number; // display-space (post-rotation) dimensions, per @mepapp/core's displayDimensions
  pageHeightPt: number;
  // The still-open document handle, kept so the app can later sync the
  // domain model back into this same PDF (exportToPdf) and download it.
  handle: PdfDocumentHandle;
}

export interface MepSketchAppProps {
  // Kept as a prop (not a direct @mepapp/pdf-engine-mupdf import) so this
  // component stays engine-agnostic — the app shell picks which PdfEngine to wire in.
  onLoadPdfPage: (file: File) => Promise<PdfPageLoadResult>;
  /** Renders a different page of an already-open handle — status bar page navigation, reusing the open PDF instead of re-parsing the file. */
  onLoadPdfPageAt: (handle: PdfDocumentHandle, pageIndex: number) => Promise<PdfPageLoadResult>;
  // AGPLv3 section 13: a network service running a modified version of this
  // app must offer the exact corresponding source. The app shell computes
  // this link (it knows the build's commit SHA); this component just shows it.
  correspondingSourceUrl?: string;
  /** Creates the room detection client (a Web Worker behind it). Without it the room menu items are disabled. */
  createRoomDetectionClient?: () => RoomDetectionClient;
  /** Resolves a stamp-library definition's iconRef to a fetchable URL. Defaults to apps/web's copy under /stamps/. */
  resolveStampIconUrl?: (iconRef: string) => string;
  /** Storage for the user's custom stamp library folders. Without it the feature is unavailable. */
  libraryStore?: LibraryStore;
}

const DEFAULT_RESOLVE_ICON_URL = (iconRef: string) => `/stamps/${iconRef}`;

// The File System Access API (showOpenFilePicker/showSaveFilePicker) is what
// lets "Save" write straight back to the file the user opened, with no
// download prompt — it's Chromium-only today (not in Firefox/Safari), so
// every call site below feature-detects it and falls back to the old
// download-a-copy behavior where it's missing. That fallback is never a
// regression: it's exactly what this app already did before Save/Save As existed.
function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

const PDF_PICKER_TYPES = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];
const FILE_TASK_BUSY_STATUS = 'Wait until the current open or save has finished.';
const XLSX_PICKER_TYPES = [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];

const ROOM_GAP_STORAGE_KEY = 'mepapp.settings.roomGapMm.v1';

function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function storeNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be blocked; the setting then lasts for this session only.
  }
}

const SNAP_RADIUS_STORAGE_KEY = 'mepapp.settings.snapRadiusPx.v1';
const ANGLE_SNAP_STORAGE_KEY = 'mepapp.settings.angleSnapDegrees.v1';
const LABEL_LANGUAGE_STORAGE_KEY = 'mepapp.settings.labelLanguage.v1';
const ONBOARDING_STORAGE_KEY = 'mepapp.onboarding.seen.v1';
const CUSTOM_PROPERTIES_STORAGE_KEY = 'mepapp.customProperties.v1';
const LABEL_VISIBILITY_STORAGE_KEY = 'mepapp.settings.labelVisibility.v1';
const EMPTY_CUSTOM_PROPERTY_DEFS: GlobalPropertyDefs = { terminal: [], equipment: [], circuit: [], room: [] };

function loadCustomPropertyDefs(): GlobalPropertyDefs {
  try {
    const raw = localStorage.getItem(CUSTOM_PROPERTIES_STORAGE_KEY);
    if (!raw) return EMPTY_CUSTOM_PROPERTY_DEFS;
    const parsed = JSON.parse(raw) as Partial<GlobalPropertyDefs>;
    return {
      terminal: Array.isArray(parsed.terminal) ? parsed.terminal : [],
      equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
      circuit: Array.isArray(parsed.circuit) ? parsed.circuit : [],
      room: Array.isArray(parsed.room) ? parsed.room : [],
    };
  } catch {
    return EMPTY_CUSTOM_PROPERTY_DEFS;
  }
}

function loadLabelVisibility(): StampLabelVisibility {
  try {
    const raw = localStorage.getItem(LABEL_VISIBILITY_STORAGE_KEY);
    if (!raw) return DEFAULT_STAMP_LABEL_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<StampLabelVisibility>;
    return {
      enabled: parsed.enabled !== false,
      hiddenDefinitionIds: Array.isArray(parsed.hiddenDefinitionIds) ? parsed.hiddenDefinitionIds : [],
      hiddenGroups: Array.isArray(parsed.hiddenGroups) ? parsed.hiddenGroups : [],
    };
  } catch {
    return DEFAULT_STAMP_LABEL_VISIBILITY;
  }
}

async function writeToFileHandle(fileHandle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function downloadPdfBytes(bytes: Uint8Array<ArrayBuffer>, fileName: string): void {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** The first discipline of a Stamps-panel discipline group — the default for a newly added stamp folder. */
function defaultDisciplineFor(group: DisciplineGroup | null): Discipline {
  switch (group) {
    case 'hvac':
      return 'ventilation';
    case 'plumbing':
      return 'plumbing';
    case 'electrical':
      return 'electrical';
    case 'fire':
      return 'fireProtection';
    default:
      return 'other';
  }
}

export function MepSketchApp({
  onLoadPdfPage,
  onLoadPdfPageAt,
  correspondingSourceUrl,
  createRoomDetectionClient,
  resolveStampIconUrl = DEFAULT_RESOLVE_ICON_URL,
  libraryStore,
}: MepSketchAppProps) {
  const userStampLibrary = useUserStampLibrary(libraryStore);
  const [showBuiltInStamps, setShowBuiltInStamps] = useShowBuiltInStamps();
  const missingUserStampIds = useMemo(
    () => new Set(userStampLibrary.records.filter((record) => record.missingFromFolder).map((record) => record.id)),
    [userStampLibrary.records],
  );
  const {
    containerRef,
    sceneRef,
    ready,
    tool,
    selection,
    selectedSegment,
    selectedSegments,
    selectedFitting,
    hasSelection,
    allStamps,
    networkSummaries,
    networkTypes,
    customStampDefinitions,
    stampLabelLayouts,
    circuits,
    panels,
    panelSections,
    circuitTypes,
    schematics,
    schematicProjectFields,
    selectedCircuitId,
    setSelectedCircuitId,
    selectedPanelId,
    setSelectedPanelId,
    circuitToolTargetId,
    selectionFromCanvas,
    showCircuitLines,
    setShowCircuitLines,
    zoom,
    pageIndex,
    pageCount,
    calibration,
    measurementMm,
    calibrationPrompt,
    setCalibrationPrompt,
    textboxPrompt,
    setTextboxPrompt,
    canvasContextMenuRequest,
    setCanvasContextMenuRequest,
    drawingSummary,
    flowResult,
    documents,
    activeDocumentId,
    activePdfHandle,
  } = useSketchScene();

  const { toasts, pushToast, dismissToast } = useToasts();
  const [status, setStatus] = useState('');
  const handleDetectRooms = useCallback(async () => {
    const scene = sceneRef.current;
    if (!scene || !createRoomDetectionClient || roomAbortRef.current) return;
    const client = (roomClientRef.current ??= createRoomDetectionClient());
    const abort = new AbortController();
    roomAbortRef.current = abort;
    setRoomsDetecting(true);
    try {
      const result = await scene.detectRooms(client, { onProgress: (fraction, phase) => setStatus(`Detecting rooms: ${phase} ${Math.round(fraction * 100)}%`), signal: abort.signal });
      if (result) {
        setStatus(`Placed ${result.found} rooms from ${result.labels} room names.`);
        pushToast({
          message: `Placed ${result.found} rooms.${result.review > 0 ? ` ${result.review} need a check (orange).` : ''}${result.missing > 0 ? ` ${result.missing} names had no room.` : ''}${result.adjusted > 0 ? ` ${result.adjusted} existing rooms were adjusted so rooms do not overlap.` : ''}`,
          kind: 'info',
        });
      } else setStatus('');
    } catch (err) {
      const cancelled = (err as Error).name === 'RoomDetectionCancelled';
      setStatus(cancelled ? 'Room detection cancelled.' : `Room detection failed: ${(err as Error).message}`);
    } finally {
      roomAbortRef.current = null;
      setRoomsDetecting(false);
    }
  }, [createRoomDetectionClient, pushToast, sceneRef]);
  const handleCancelRoomDetection = useCallback(() => roomAbortRef.current?.abort(), []);
  const [wallDebugVisible, setWallDebugVisible] = useState(false);
  const handleToggleWallDebug = useCallback(() => sceneRef.current?.setWallDebugVisible(!sceneRef.current.getWallDebugState().visible), [sceneRef]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const onChanged = (s: WallDebugState) => setWallDebugVisible(s.visible);
    scene.on('wallDebugChanged', onChanged);
    return () => scene.off('wallDebugChanged', onChanged);
  }, [ready, sceneRef]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    setRoomsVisible(scene.isRoomsVisible());
    scene.on('roomsVisibleChanged', setRoomsVisible);
    return () => scene.off('roomsVisibleChanged', setRoomsVisible);
  }, [ready, sceneRef]);
  const roomClientRef = useRef<RoomDetectionClient | null>(null);
  const roomAbortRef = useRef<AbortController | null>(null);
  const [roomsDetecting, setRoomsDetecting] = useState(false);
  const [roomGapMm, setRoomGapMm] = useState(() => readStoredNumber(ROOM_GAP_STORAGE_KEY, 1000));
  const selectedRooms = useRoomSelection(sceneRef, ready);
  useEffect(() => {
    if (ready) sceneRef.current?.setRoomSettings({ gapMm: roomGapMm });
  }, [ready, roomGapMm, sceneRef]);
  const [roomsVisible, setRoomsVisible] = useState(true);
  useEffect(() => () => roomClientRef.current?.dispose(), []);
  const networkTreeState = useNetworkTreeState();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    scene.on('notice', pushToast);
    return () => scene.off('notice', pushToast);
  }, [ready, sceneRef, pushToast]);
  const [textboxInput, setTextboxInput] = useState('');
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [disciplineGroup, setDisciplineGroup] = useState<DisciplineGroup | null>(null);
  const [stampCategoryFilter, setStampCategoryFilter] = useState<StampCategoryFilter>('terminal');
  const [labelLanguage, setLabelLanguage] = useState<StampLabelLanguage>(() =>
    localStorage.getItem(LABEL_LANGUAGE_STORAGE_KEY) === 'nl' ? 'nl' : 'en',
  );
  const [activeDefinitionId, setActiveDefinitionId] = useState<string | null>(null);
  const [activeNetworkTypeId, setActiveNetworkTypeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalPropertiesOpen, setGlobalPropertiesOpen] = useState(false);
  const [customPropertyDefs, setCustomPropertyDefs] = useState<GlobalPropertyDefs>(loadCustomPropertyDefs);
  const [labelVisibility, setLabelVisibility] = useState<StampLabelVisibility>(loadLabelVisibility);
  const [manageBuildingsOpen, setManageBuildingsOpen] = useState(false);
  /** Element Editor dialog target — 'create' for a brand-new custom element, the definitionId being re-authored via a placed instance's "Edit ports…" (see PropertiesPanel), or 'duplicate' for a library stamp opened for editing via its Stamps tab tile (see handleDuplicateStampDefinition — `seed` keeps the library entry's own id, so the save is an override that every stamp placed from it follows, and carries a self-contained iconRef). */
  const [elementEditorTarget, setElementEditorTarget] = useState<
    { mode: 'create' } | { mode: 'edit'; definitionId: string } | { mode: 'duplicate'; seed: StampDefinition } | { mode: 'edit-user'; definition: StampDefinition } | null
  >(null);
  const [networkTypeEditorTarget, setNetworkTypeEditorTarget] = useState<NetworkType | null>(null);
  /** The placed stamp whose definition's label layout is open in StampLabelsDialog. */
  const [labelEditorStampId, setLabelEditorStampId] = useState<string | null>(null);
  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  const [circuitTypesOpen, setCircuitTypesOpen] = useState(false);
  const [schematicPanelId, setSchematicPanelId] = useState<string | null>(null);
  const [customSchematicTemplates, setCustomSchematicTemplates] = useState<SchematicTemplate[]>(() => loadCustomTemplates(typeof localStorage === 'undefined' ? undefined : localStorage));
  const [schematicTemplateId, setSchematicTemplateId] = useState(SCHEMATIC_TEMPLATE_LIBRARY[0].id);
  useEffect(() => saveCustomTemplates(typeof localStorage === 'undefined' ? undefined : localStorage, customSchematicTemplates), [customSchematicTemplates]);
  const [customSchematicSymbols, setCustomSchematicSymbols] = useState<SchematicSymbol[]>(() => loadCustomSymbols(typeof localStorage === 'undefined' ? undefined : localStorage));
  useEffect(() => saveCustomSymbols(typeof localStorage === 'undefined' ? undefined : localStorage, customSchematicSymbols), [customSchematicSymbols]);
  const [buildings, setBuildings] = useState<Building[]>(loadBuildings);
  const [onboardingSeen, setOnboardingSeen] = useState(() => localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1');
  const [snapRadiusPx, setSnapRadiusPx] = useState(() => {
    const saved = Number(localStorage.getItem(SNAP_RADIUS_STORAGE_KEY));
    return saved >= MIN_SNAP_RADIUS_PX && saved <= MAX_SNAP_RADIUS_PX ? saved : DEFAULT_SNAP_RADIUS_SCREEN_PX;
  });
  const [angleSnapDegrees, setAngleSnapDegrees] = useState(() => {
    const saved = Number(localStorage.getItem(ANGLE_SNAP_STORAGE_KEY));
    return saved >= MIN_ANGLE_SNAP_DEGREES && saved <= MAX_ANGLE_SNAP_DEGREES ? saved : DEFAULT_ANGLE_SNAP_DEGREES;
  });
  const textboxRef = useRef<HTMLTextAreaElement | null>(null);

  // Applies the persisted/user-set snap radius to the scene once it exists
  // (SketchScene itself always starts at its own hardcoded default) and again
  // whenever Settings changes it.
  useEffect(() => {
    if (ready) sceneRef.current?.setSnapRadius(snapRadiusPx);
  }, [ready, snapRadiusPx, sceneRef]);

  // Same pattern as snapRadiusPx above, for the segment-drawing angle snap.
  useEffect(() => {
    if (ready) sceneRef.current?.setAngleSnapDegrees(angleSnapDegrees);
  }, [ready, angleSnapDegrees, sceneRef]);
  useEffect(() => {
    if (ready) sceneRef.current?.setLabelContext({ customPropertyDefs, labelLanguage });
  }, [ready, customPropertyDefs, labelLanguage, sceneRef]);
  useEffect(() => {
    if (ready) sceneRef.current?.setLabelVisibility(labelVisibility);
  }, [ready, labelVisibility, sceneRef]);
  const handleLabelVisibilityChange = useCallback((next: StampLabelVisibility) => {
    setLabelVisibility(next);
    localStorage.setItem(LABEL_VISIBILITY_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const handleChangeSnapRadiusPx = useCallback((px: number) => {
    setSnapRadiusPx(px);
    localStorage.setItem(SNAP_RADIUS_STORAGE_KEY, String(px));
  }, []);

  const handleChangeAngleSnapDegrees = useCallback((degrees: number) => {
    setAngleSnapDegrees(degrees);
    localStorage.setItem(ANGLE_SNAP_STORAGE_KEY, String(degrees));
  }, []);

  const handleChangeLabelLanguage = useCallback((language: StampLabelLanguage) => {
    setLabelLanguage(language);
    localStorage.setItem(LABEL_LANGUAGE_STORAGE_KEY, language);
  }, []);

  const handleDismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setOnboardingSeen(true);
  }, []);

  const handleSaveCustomPropertyDefs = useCallback(
    (next: GlobalPropertyDefs, renamed: GlobalPropertyRenames) => {
      sceneRef.current?.applyCustomPropertyCascade('terminal', customPropertyDefs.terminal, next.terminal, renamed.terminal);
      sceneRef.current?.applyCustomPropertyCascade('equipment', customPropertyDefs.equipment, next.equipment, renamed.equipment);
      sceneRef.current?.applyCustomPropertyCascade('circuit', customPropertyDefs.circuit, next.circuit, renamed.circuit);
      sceneRef.current?.applyCustomPropertyCascade('room', customPropertyDefs.room, next.room, renamed.room);
      setCustomPropertyDefs(next);
      localStorage.setItem(CUSTOM_PROPERTIES_STORAGE_KEY, JSON.stringify(next));
      setGlobalPropertiesOpen(false);
    },
    [sceneRef, customPropertyDefs],
  );

  const handleChangeBuildings = useCallback((next: Building[]) => {
    setBuildings(next);
    saveBuildings(next);
  }, []);

  /** Status bar's page nav — reuses the already-open PDF handle, no re-parse. View-only: see SketchScene.setBackdropPage. */
  const pageRequestRef = useRef(0);
  const handleChangePage = useCallback(
    async (nextPageIndex: number) => {
      if (!activePdfHandle) return;
      const request = ++pageRequestRef.current;
      try {
        const { bitmap, pageWidthPt, pageHeightPt } = await onLoadPdfPageAt(activePdfHandle, nextPageIndex);
        // setBackdropPage acts on the active document, so a result that a later page click or a document switch overtook is dropped.
        if (request !== pageRequestRef.current || sceneRef.current?.getActiveDocumentId() !== activeDocumentId) {
          bitmap.close();
          return;
        }
        sceneRef.current?.setBackdropPage(bitmap, pageWidthPt, pageHeightPt, nextPageIndex);
      } catch (err) {
        setStatus(`Could not show page ${nextPageIndex + 1}: ${(err as Error).message}`);
      }
    },
    [activeDocumentId, activePdfHandle, onLoadPdfPageAt, sceneRef],
  );

  // The scene resets its armed stamp and active network type on a document switch; the Stamps tab must not keep showing them.
  useEffect(() => {
    setActiveDefinitionId(null);
    setActiveNetworkTypeId(null);
  }, [activeDocumentId]);

  // Deferred, not `autoFocus`: the click that opens this prompt is the same
  // mousedown/mouseup the browser is still processing its own default focus
  // handling for (canvas isn't focusable, so that default action lands focus
  // back on <body>) — focusing synchronously during that same gesture loses
  // the race and the immediate blur dismisses the prompt before it's ever
  // seen. Waiting a macrotask lets that default action finish first.
  useEffect(() => {
    if (!textboxPrompt) return;
    setTextboxInput(textboxPrompt.initialText);
    const id = setTimeout(() => textboxRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [textboxPrompt]);

  const activeDoc = documents.find((d) => d.id === activeDocumentId) ?? null;
  const sheetName = activeDoc?.hasPdf ? activeDoc.fileName : null;
  const pdfHandle = activePdfHandle;

  // A document's FileSystemFileHandle, when "Open"/"Save As" got one from the
  // File System Access API — keyed by document id so "Save" knows which real
  // file to write back to. Not scene state: @mepapp/render stays platform-
  // agnostic (see its IconBitmapResolver layering), and this is a browser-only
  // concern. A plain ref, not state: it's write-target bookkeeping, never rendered.
  const fileHandlesRef = useRef(new Map<string, FileSystemFileHandle>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The open/save running right now, if any. Only one runs at a time: two
  // overlapping saves of one PDF both write the same new annotations, and
  // closing a document mid-task destroys what the task still reads.
  const fileTaskRef = useRef<{ documentId: string | null } | null>(null);

  // Resolves a stamp definition's actual pixels for loadProjectFromJson/loadFromPdf to rebuild a
  // restored stamp's sprite — SketchScene has no fetch of its own, same layering as
  // resolveStampIconUrl/StampsPanel. loadDefinitionBitmap rasterizes `shapes` directly when
  // present, only falling back to fetching iconRef for a shapeless raster-only custom stamp.
  const resolveStampIconBitmap = useCallback(
    async (definition: StampDefinition) => {
      return loadDefinitionBitmap(definition, async () => {
        // A custom (Element Editor-authored) definition's iconRef is already a
        // self-contained `data:` URL — fetch() handles those directly, so skip
        // resolveStampIconUrl's fixture-relative `/stamps/` prefixing for it.
        const res = await fetch(definition.iconRef.startsWith('data:') ? definition.iconRef : resolveStampIconUrl(definition.iconRef));
        return res.blob();
      });
    },
    [resolveStampIconUrl],
  );

  const openPdfFile = useCallback(
    async (file: File, fileHandle: FileSystemFileHandle | null) => {
      // Reopening a file already open elsewhere in the document list just
      // switches to its tab — no re-parse, no duplicate — see decisions log
      // 2026-09-07's multi-document plan, D3.
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      const existingId = sceneRef.current?.findDocumentByFileKey(fileKey);
      if (existingId) {
        sceneRef.current?.activateDocument(existingId);
        if (fileHandle) fileHandlesRef.current.set(existingId, fileHandle);
        setStatus(`Switched to already-open ${file.name}.`);
        return;
      }

      if (fileTaskRef.current) {
        setStatus(FILE_TASK_BUSY_STATUS);
        return;
      }
      const task: { documentId: string | null } = { documentId: null };
      fileTaskRef.current = task;
      setStatus(`Loading ${file.name}...`);
      try {
        const { bitmap, pageWidthPt, pageHeightPt, handle } = await onLoadPdfPage(file);
        task.documentId = sceneRef.current?.openDocument(bitmap, pageWidthPt, pageHeightPt, { fileKey, fileName: file.name, handle }) ?? null;
        if (task.documentId && fileHandle) fileHandlesRef.current.set(task.documentId, fileHandle);
        // Loads this PDF's own embedded project data (if any) and compares
        // its annotations against that domain model — see decisions log
        // 2026-09-06's reconciliation policy: flag drift/missing, never
        // silently resolve either way. The user never sees this as a separate
        // "project file" — Open/Save hide it entirely, it's just "the PDF."
        const report = sceneRef.current ? await sceneRef.current.loadFromPdf(handle, resolveStampIconBitmap) : null;
        if (sceneRef.current?.getActiveDocumentId() === task.documentId) {
          setReconciliation(report && (report.drifted.length > 0 || report.missingIds.length > 0) ? report : null);
        }
        setStatus(`Loaded ${file.name} (${pageWidthPt.toFixed(1)} x ${pageHeightPt.toFixed(1)} pt)`);
      } catch (err) {
        // Kept open, a document whose project failed to load (for example one
        // saved by a newer MepApp) shows an empty drawing, and a Save would
        // write that over the file's real project data.
        if (task.documentId) {
          fileHandlesRef.current.delete(task.documentId);
          sceneRef.current?.closeDocument(task.documentId);
        }
        setStatus(`Could not open ${file.name}: ${(err as Error).message}. The file was not changed.`);
      } finally {
        fileTaskRef.current = null;
      }
    },
    [onLoadPdfPage, resolveStampIconBitmap, sceneRef],
  );

  // The hidden <input type="file"> below is the fallback path for browsers
  // without the File System Access API — its onChange calls this directly.
  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ''; // so picking the same file twice in a row still fires onChange
      if (file) void openPdfFile(file, null);
    },
    [openPdfFile],
  );

  const handleOpenPdf = useCallback(async () => {
    if (!supportsFileSystemAccess()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker!({ types: PDF_PICKER_TYPES });
      const file = await fileHandle.getFile();
      await openPdfFile(file, fileHandle);
    } catch (err) {
      if (!isAbortError(err)) setStatus(`Failed to open PDF: ${(err as Error).message}`);
    }
  }, [openPdfFile]);

  const handleActivateDocument = useCallback(
    (id: string) => {
      sceneRef.current?.activateDocument(id);
      setReconciliation(null); // tied to the load that produced it, not something to resurrect on tab-switch-back
    },
    [sceneRef],
  );

  const handleCloseDocument = useCallback(
    (id: string) => {
      if (fileTaskRef.current?.documentId === id) {
        setStatus(FILE_TASK_BUSY_STATUS);
        return;
      }
      const target = documents.find((d) => d.id === id);
      if (target?.isDirty && !window.confirm(`"${target.fileName}" has unsaved changes. Close anyway?`)) return;
      sceneRef.current?.closeDocument(id);
    },
    [documents, sceneRef],
  );

  // The browser's own "Leave site?" prompt — the only guard when the tab
  // itself is closed or reloaded with unsaved drawings open.
  const hasUnsavedDocuments = documents.some((d) => d.isDirty);
  useEffect(() => {
    if (!hasUnsavedDocuments) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedDocuments]);

  // A canvas click changes the selection on pointerdown, and the browser
  // blurs a focused side-panel input only after that — so an input that
  // commits on blur (RoomProperties' CommitInput) wrote its text to the
  // newly selected element. Blurring it first, in the capture phase before
  // the scene sees the click, commits the text to the element it was typed for.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blurSidePanelInput = () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && !container.contains(focused)) focused.blur();
    };
    container.addEventListener('pointerdown', blurSidePanelInput, { capture: true });
    return () => container.removeEventListener('pointerdown', blurSidePanelInput, { capture: true });
  }, [containerRef]);

  // Shared by Save and Save As: writes the current drawing into the open
  // PDF's annotations and embedded project data, then returns the resulting
  // file bytes. Always runs first — otherwise a placed stamp/segment never
  // reaches the file if the user saves without an explicit sync step first
  // (see decisions log: this was shipping PDFs with no stamps).
  const syncAndGetPdfBytes = useCallback(async (): Promise<{ bytes: Uint8Array<ArrayBuffer>; receipt: PdfExportReceipt } | null> => {
    if (!sceneRef.current || !pdfHandle) return null;
    const receipt = await sceneRef.current.exportToPdf(pdfHandle);
    setReconciliation(null);
    return { bytes: new Uint8Array(await pdfHandle.save()), receipt };
  }, [pdfHandle, sceneRef]);

  // Prompts for a new file location (or downloads a copy, on browsers without
  // the File System Access API) and remembers it as the document's save
  // target from here on. Resolves false when the user cancels the picker;
  // a failed write throws.
  const saveAsNewFile = useCallback(
    async (bytes: Uint8Array<ArrayBuffer>, documentId: string): Promise<boolean> => {
      const suggestedName = documents.find((d) => d.id === documentId)?.fileName ?? 'mepapp-drawing.pdf';
      if (!supportsFileSystemAccess()) {
        downloadPdfBytes(bytes, suggestedName);
        setStatus(`Downloaded ${suggestedName}.`);
        return true;
      }
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await window.showSaveFilePicker!({ suggestedName, types: PDF_PICKER_TYPES });
      } catch (err) {
        if (isAbortError(err)) return false;
        throw err;
      }
      await writeToFileHandle(fileHandle, bytes);
      fileHandlesRef.current.set(documentId, fileHandle);
      sceneRef.current?.renameDocument(documentId, fileHandle.name);
      setStatus(`Saved as ${fileHandle.name}.`);
      return true;
    },
    [documents, sceneRef],
  );

  // The unsaved-changes marker is cleared only after the bytes reach the
  // file, so a cancelled picker or a failed write keeps the close warning.
  const saveDocument = useCallback(
    async (asNewFile: boolean) => {
      if (fileTaskRef.current) {
        setStatus(FILE_TASK_BUSY_STATUS);
        return;
      }
      fileTaskRef.current = { documentId: activeDocumentId };
      setStatus('Saving...');
      try {
        const result = await syncAndGetPdfBytes();
        if (!result) {
          setStatus('');
          return;
        }
        const documentId = result.receipt.documentId;
        // Never saved to a real file yet (opened via the legacy file-picker
        // fallback, or this is a brand new document) — first save behaves like Save As.
        const fileHandle = asNewFile ? undefined : fileHandlesRef.current.get(documentId);
        let saved = false;
        if (fileHandle) {
          await writeToFileHandle(fileHandle, result.bytes);
          setStatus(`Saved ${fileHandle.name}.`);
          saved = true;
        } else {
          saved = await saveAsNewFile(result.bytes, documentId);
          if (!saved) setStatus('Save cancelled.');
        }
        if (saved) sceneRef.current?.markSaved(result.receipt);
      } catch (err) {
        setStatus(`Failed to save: ${(err as Error).message}`);
      } finally {
        fileTaskRef.current = null;
      }
    },
    [activeDocumentId, saveAsNewFile, sceneRef, syncAndGetPdfBytes],
  );

  const handleExportRooms = useCallback(async () => {
    const rooms = sceneRef.current?.listRooms() ?? [];
    if (rooms.length === 0) {
      setStatus('There are no rooms to export.');
      return;
    }
    try {
      const blob = await roomTableToXlsx(buildRoomExportTable(rooms, (pageIndex) => sceneRef.current?.getCalibration(pageIndex) ?? null, customPropertyDefs.room));
      const suggestedName = `${(activeDoc?.fileName ?? 'rooms').replace(/\.pdf$/i, '')}-rooms.xlsx`;
      if (!supportsFileSystemAccess()) {
        downloadBlob(blob, suggestedName);
        setStatus(`Downloaded ${suggestedName} (${rooms.length} rooms).`);
        return;
      }
      const fileHandle = await window.showSaveFilePicker!({ suggestedName, types: XLSX_PICKER_TYPES });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`Exported ${rooms.length} rooms to ${fileHandle.name}.`);
    } catch (err) {
      if (!isAbortError(err)) setStatus(`Failed to export rooms: ${(err as Error).message}`);
    }
  }, [activeDoc, customPropertyDefs.room, sceneRef]);

  const handleSave = useCallback(() => saveDocument(false), [saveDocument]);
  const handleSaveAs = useCallback(() => saveDocument(true), [saveDocument]);

  const handleStampPick = useCallback((definition: StampDefinition) => {
    setActiveDefinitionId(definition.id);
    setStatus(`${definition.label} ready — click the canvas to place it.`);
  }, []);

  // Left rail's Stamp button, clicked with nothing picked yet — arms the same
  // first stamp the MEP tab's grid itself would show (its current discipline/category filters).
  const handlePickDefaultStamp = useCallback(() => {
    const definitions = getVisibleStampDefinitions(customStampDefinitions, disciplineGroup, stampCategoryFilter, labelLanguage, '', userStampLibrary.definitions, {
      showBuiltIn: showBuiltInStamps,
      libraryRecordIds: userStampLibrary.allRecordIds,
    });
    const first = definitions[0];
    if (first) void pickStampDefinition(sceneRef, first, resolveStampIconUrl, handleStampPick, userStampLibrary.materialize);
  }, [customStampDefinitions, disciplineGroup, stampCategoryFilter, labelLanguage, userStampLibrary.definitions, userStampLibrary.allRecordIds, showBuiltInStamps, userStampLibrary.materialize, resolveStampIconUrl, handleStampPick, sceneRef]);

  // Opens the Element Editor pre-filled from a read-only library stamp so the
  // user can reposition ports / rename / recategorize and save an override of
  // it under the same id. Its iconRef is a fixture-relative asset key (see
  // StampDefinition's doc comment), not the self-contained `data:` URL the
  // dialog's Import mode expects, so it's fetched and re-embedded here — same
  // fetch-then-blob approach as resolveStampIconBitmap above. Ports are
  // shallow-cloned so the dialog's editable state never shares array/object
  // references with the library's own (module-level, shared) definition.
  const handleDuplicateStampDefinition = useCallback(
    async (definition: StampDefinition) => {
      try {
        const res = await fetch(definition.iconRef.startsWith('data:') ? definition.iconRef : resolveStampIconUrl(definition.iconRef));
        const blob = await res.blob();
        const iconRef = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error ?? new Error('Failed to read stamp art'));
          reader.readAsDataURL(blob);
        });
        setElementEditorTarget({
          mode: 'duplicate',
          seed: {
            ...definition,
            // Keeps the library original's exact name rather than auto-appending "Copy" — most of
            // the time the user is just re-authoring this stamp in place and saving under the same
            // name, and ElementEditorDialog's own Name-collision check (against both
            // customStampDefinitions and STAMP_LIBRARY) prompts to overwrite instead of silently
            // duplicating. labelNl is kept (not stripped) so the dialog's Name field seeds from the
            // library original's Dutch name when the Stamps tab's language toggle is set to NL —
            // buildDefinition() never copies labelNl into the saved definition, so this never leaks
            // into the resulting custom stamp; it only affects what the Name field starts as.
            iconRef,
            source: 'custom',
            ports: definition.ports.map((port) => ({ ...port })),
            shapes: definition.shapes?.map((shape) => ({
              ...shape,
              style: { ...shape.style },
              ...(shape.kind === 'polygon' ? { points: shape.points.map((point) => ({ ...point })) } : {}),
            })),
          },
        });
      } catch (err) {
        setStatus(`Could not duplicate ${definition.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [resolveStampIconUrl],
  );

  const labelPropertyContext = useMemo(
    () =>
      buildStampPropertyContext({
        customStampDefinitions,
        terminalCapacities: Object.fromEntries(allStamps.map((s) => [s.id, s.capacity])),
        circuits,
        panels,
        circuitTypes,
        customPropertyDefs,
        labelLanguage,
      }),
    [customStampDefinitions, allStamps, circuits, panels, circuitTypes, customPropertyDefs, labelLanguage],
  );
  const labelFilterEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: Array<{ definitionId: string; name: string; category: StampCategory }> = [];
    for (const stamp of allStamps) {
      const id = stamp.definitionId;
      if (!id || seen.has(id) || !stampLabelLayouts[id]) continue;
      seen.add(id);
      const def = getStampDefinition(id, customStampDefinitions);
      entries.push({ definitionId: id, name: def ? (labelLanguage === 'nl' && def.labelNl ? def.labelNl : def.label) : id, category: stamp.category });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [allStamps, stampLabelLayouts, customStampDefinitions, labelLanguage]);
  const handleReplaceStamps = useCallback(
    async (picked: StampDefinition) => {
      setReplacePickerOpen(false);
      // A user-library stamp is read back with a data: URL and ports first, so the project gets a self-contained copy — same as placing it.
      const definition = picked.source === 'user' ? await userStampLibrary.materialize(picked.id) : picked;
      if (!definition) {
        console.warn(`[mepapp] could not read the library stamp "${picked.id}"; the selection is not replaced.`);
        return;
      }
      const panelStamps = sceneRef.current?.countPanelStampsBlockingReplace(definition) ?? 0;
      if (panelStamps > 0) {
        window.alert(`${panelStamps} of the selected stamps are the equipment of a panel, so they can only be replaced with another equipment stamp. Nothing was changed.`);
        return;
      }
      const mismatch = sceneRef.current?.getReplacePortMismatch(definition);
      if (mismatch && mismatch.stamps > 0) {
        const lost = mismatch.connectedEnds > 0 ? ` ${mismatch.connectedEnds} connected segment end(s) will be detached onto junction fittings.` : '';
        const message = `${mismatch.stamps} of the selected stamps do not have the same number of ports as "${definition.label}", so their ports cannot be matched by location. Ports that share an id are kept.${lost} Replace anyway?`;
        if (!window.confirm(message)) return;
      }
      const bitmap = await resolveStampIconBitmap(definition);
      sceneRef.current?.replaceSelectedStamps(definition, bitmap);
    },
    [userStampLibrary.materialize, resolveStampIconBitmap, sceneRef],
  );
  const labelEditorStamp = labelEditorStampId ? allStamps.find((s) => s.id === labelEditorStampId) : undefined;
  const labelEditorDefinition = labelEditorStamp?.definitionId ? getStampDefinition(labelEditorStamp.definitionId, customStampDefinitions) : undefined;

  // An Element Editor save or a revert applies to the stamps already placed: ports and size at
  // once, the artwork as soon as it is loaded.
  const applyDefinitionToPlacedStamps = useCallback(
    (definition: StampDefinition) => {
      const scene = sceneRef.current;
      if (!scene) return;
      scene.applyDefinitionToPlacedStamps(definition);
      resolveStampIconBitmap(definition)
        .then((bitmap) => scene.setDefinitionArtwork(definition.id, bitmap))
        .catch((err) => setStatus(`Could not load the artwork of ${definition.label}: ${err instanceof Error ? err.message : String(err)}`));
    },
    [sceneRef, resolveStampIconBitmap],
  );

  const handleSaveElementDefinition = useCallback(
    (definition: StampDefinition, labels?: StampLabel[]) => {
      if (labels) sceneRef.current?.setStampLabelLayout(definition.id, labels);
      // Whether this is an in-place update vs. a brand-new entry is decided by id membership, not
      // by elementEditorTarget.mode — the dialog's own overwrite-confirmation prompt (Name
      // collision) reassigns a create/duplicate save's id to an existing custom definition's id to
      // fold it in, so that must update rather than add too.
      const isOverwrite = customStampDefinitions.some((d) => d.id === definition.id);
      if (isOverwrite) {
        sceneRef.current?.updateCustomStampDefinition(definition.id, definition);
        setStatus(`${definition.label} updated.`);
      } else {
        sceneRef.current?.addCustomStampDefinition(definition);
        setStatus(isLibraryStampId(definition.id) ? `${definition.label} updated.` : `${definition.label} created — pick it from the Stamps tab to place it.`);
      }
      applyDefinitionToPlacedStamps(definition);
      setElementEditorTarget(null);
    },
    [customStampDefinitions, sceneRef, applyDefinitionToPlacedStamps],
  );

  const revertCustomOverride = useCallback(
    (definition: StampDefinition) => {
      const library = STAMP_LIBRARY.find((def) => def.id === definition.id);
      if (!library) return;
      sceneRef.current?.removeCustomStampDefinition(definition.id);
      sceneRef.current?.setStampLabelLayout(definition.id, []);
      applyDefinitionToPlacedStamps(library);
    },
    [sceneRef, applyDefinitionToPlacedStamps],
  );

  const deleteCustomDefinition = useCallback(
    (definition: StampDefinition) => {
      sceneRef.current?.removeCustomStampDefinition(definition.id);
    },
    [sceneRef],
  );

  const handleDeleteCustomStampDefinition = useCallback(
    (definition: StampDefinition) => {
      const library = STAMP_LIBRARY.find((def) => def.id === definition.id);
      if (library) {
        const count = allStamps.filter((s) => s.definitionId === definition.id).length;
        const placed = count > 0 ? ` ${count} placed stamp${count === 1 ? '' : 's'} on this sheet go back to the library artwork, ports and size.` : '';
        const lost = sceneRef.current?.countLostPortConnections(definition.id, library.ports) ?? 0;
        const lostWarning = lost > 0 ? ` ${lost} segment connection${lost === 1 ? '' : 's'} to removed ports will be lost.` : '';
        if (!window.confirm(`Revert "${definition.label}" to the library version? Your changes and its labels are removed.${placed}${lostWarning}`)) return;
        revertCustomOverride(definition);
        setStatus(`${library.label} reverted to the library version.`);
        return;
      }
      const placedCount = allStamps.filter((s) => s.definitionId === definition.id).length;
      const usageWarning = placedCount > 0 ? ` ${placedCount} placed element${placedCount === 1 ? '' : 's'} on this sheet use it and will keep their current look but lose their icon if this document is reopened later.` : '';
      if (!window.confirm(`Delete "${definition.label}"? This cannot be undone.${usageWarning}`)) return;
      deleteCustomDefinition(definition);
      setStatus(`${definition.label} deleted.`);
    },
    [allStamps, sceneRef, revertCustomOverride, deleteCustomDefinition],
  );

  const savedUserStampIds = useMemo(
    () => new Set(userStampLibrary.records.filter((record) => record.sourceId === SAVED_STAMPS_SOURCE_ID).map((record) => record.id)),
    [userStampLibrary.records],
  );

  const handleEditUserStamp = useCallback(
    async (stampId: string) => {
      const definition = await userStampLibrary.materialize(stampId);
      if (!definition) {
        setStatus('Could not read this library stamp.');
        return;
      }
      setElementEditorTarget({ mode: 'edit-user', definition });
    },
    [userStampLibrary],
  );

  // Opens the Element Editor for a placed stamp's definition the same way the Stamps tab's pencil on that definition's tile does.
  const handleEditPlacedStamp = useCallback(
    (stampId: string) => {
      const stamp = allStamps.find((s) => s.id === stampId);
      const definition = stamp?.definitionId ? getStampDefinition(stamp.definitionId, customStampDefinitions) : undefined;
      if (!definition) return;
      if (definition.source === 'library') void handleDuplicateStampDefinition(definition);
      else if (definition.source === 'custom') setElementEditorTarget({ mode: 'edit', definitionId: definition.id });
      else if (userStampLibrary.allRecordIds.has(definition.id)) void handleEditUserStamp(definition.id);
      else setStatus('This stamp is no longer in a library folder, so it cannot be edited.');
    },
    [allStamps, customStampDefinitions, handleDuplicateStampDefinition, handleEditUserStamp, userStampLibrary.allRecordIds],
  );

  const hideOrDeleteUserStamps = useCallback(
    async (definitions: StampDefinition[]): Promise<{ hidden: number; deleted: number }> => {
      const result = { hidden: 0, deleted: 0 };
      if (!libraryStore || definitions.length === 0) return result;
      try {
        for (const definition of definitions) {
          if (savedUserStampIds.has(definition.id)) {
            await deleteSavedStamp(libraryStore, definition.id);
            result.deleted += 1;
          } else {
            await setUserStampHidden(libraryStore, definition.id, true);
            result.hidden += 1;
          }
        }
      } finally {
        await userStampLibrary.reload();
      }
      return result;
    },
    [libraryStore, savedUserStampIds, userStampLibrary],
  );

  const handleDeleteUserStamp = useCallback(
    async (definition: StampDefinition) => {
      if (!libraryStore) return;
      const saved = savedUserStampIds.has(definition.id);
      const message = saved
        ? `Delete "${definition.label}"? This cannot be undone. Stamps already placed in a project keep their own copy.`
        : `Hide "${definition.label}"? The file stays in the folder. Show it again from the user library dialog.`;
      if (!window.confirm(message)) return;
      try {
        await hideOrDeleteUserStamps([definition]);
        setStatus(saved ? `${definition.label} deleted.` : `${definition.label} hidden.`);
      } catch (err) {
        setStatus(`Could not ${saved ? 'delete' : 'hide'} "${definition.label}": ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [libraryStore, savedUserStampIds, hideOrDeleteUserStamps],
  );

  const handleBulkDelete = useCallback(
    async (definitions: StampDefinition[]): Promise<boolean> => {
      if (definitions.length === 0) return false;
      const groups = classifyStampsForDelete(definitions, {
        userStampIds: new Set(userStampLibrary.definitions.map((d) => d.id)),
        savedUserStampIds,
        isLibraryStampId,
      });
      const placed = groups.deleteCustom.reduce((sum, d) => sum + allStamps.filter((s) => s.definitionId === d.id).length, 0);
      const lostConnections = groups.revert.reduce((sum, d) => {
        const library = STAMP_LIBRARY.find((def) => def.id === d.id);
        return sum + (library ? (sceneRef.current?.countLostPortConnections(d.id, library.ports) ?? 0) : 0);
      }, 0);
      if (!window.confirm(bulkDeleteMessage(groups, { placed, lostConnections }))) return false;
      for (const definition of groups.revert) revertCustomOverride(definition);
      for (const definition of groups.deleteCustom) deleteCustomDefinition(definition);
      try {
        const { hidden, deleted } = await hideOrDeleteUserStamps([...groups.hide, ...groups.deleteSaved]);
        const reverted = groups.revert.length;
        const removed = groups.deleteCustom.length + deleted;
        const counts: Array<[string, number]> = [
          ['deleted', removed],
          ['hid', hidden],
          ['reverted', reverted],
        ];
        const parts = counts.filter(([, n]) => n > 0).map(([verb, n], i) => (i === 0 ? `${verb} ${n} ${n === 1 ? 'stamp' : 'stamps'}` : `${verb} ${n}`));
        const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
        setStatus(`${text.charAt(0).toUpperCase()}${text.slice(1)}.`);
      } catch (err) {
        setStatus(`Could not hide or delete the library stamps: ${err instanceof Error ? err.message : String(err)}`);
      }
      return true;
    },
    [userStampLibrary, savedUserStampIds, allStamps, sceneRef, revertCustomOverride, deleteCustomDefinition, hideOrDeleteUserStamps],
  );

  const handleShowHiddenStamps = useCallback(
    async (source: LibrarySourceRecord) => {
      if (!libraryStore) return;
      try {
        await showHiddenStamps(libraryStore, source.id);
        await userStampLibrary.reload();
        setStatus(`Showing the hidden stamps of "${source.name}" again.`);
      } catch (err) {
        setStatus(`Could not show the hidden stamps: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [libraryStore, userStampLibrary],
  );

  const handleSaveUserStamp = useCallback(
    async (built: StampDefinition, labels?: StampLabel[]) => {
      if (!libraryStore) return;
      try {
        const materialized = await saveUserStampEdits(libraryStore, built.id, built);
        await userStampLibrary.reload();
        if (labels) sceneRef.current?.setStampLabelLayout(built.id, labels);
        if (materialized && customStampDefinitions.some((d) => d.id === built.id)) {
          sceneRef.current?.updateCustomStampDefinition(built.id, materialized);
          applyDefinitionToPlacedStamps(materialized);
        }
        setStatus(`${built.label} saved to your library.`);
        setElementEditorTarget(null);
      } catch (err) {
        setStatus(`Could not save "${built.label}": ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [libraryStore, userStampLibrary, sceneRef, customStampDefinitions, applyDefinitionToPlacedStamps],
  );

  const handleSaveUserStampAs = useCallback(
    async (built: StampDefinition, labels?: StampLabel[]) => {
      if (!libraryStore) return;
      try {
        const created = await saveUserStampAs(libraryStore, built.id, built);
        await userStampLibrary.reload();
        if (created && labels) sceneRef.current?.setStampLabelLayout(created.id, labels);
        setStatus(`${built.label} saved as a new stamp in your library.`);
        setElementEditorTarget(null);
      } catch (err) {
        setStatus(`Could not save "${built.label}": ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [libraryStore, userStampLibrary, sceneRef],
  );

  // A folder the user picked, waiting for its name and discipline in LibrarySourceDialog.
  const [pendingLibraryFolder, setPendingLibraryFolder] = useState<{ dirHandle: FileSystemDirectoryHandle; category: StampCategoryFilter } | null>(null);
  const [libraryFolderBusy, setLibraryFolderBusy] = useState(false);
  const [libraryFoldersOpen, setLibraryFoldersOpen] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);

  // The folder picker must be the first call in the click handler: the browser grants it only to a click that has not awaited anything yet.
  const handleLoadUserFolder = useCallback(async (category: StampCategoryFilter) => {
    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await window.showDirectoryPicker!({ id: 'mepapp-stamp-library', mode: 'read' });
    } catch (err) {
      if (isAbortError(err)) return;
      setStatus(`The browser refused this folder (${err instanceof Error ? err.message : String(err)}). Pick a subfolder instead.`);
      return;
    }
    setPendingLibraryFolder({ dirHandle, category });
  }, []);

  const handleConfirmLibraryFolder = useCallback(
    async (name: string, discipline: Discipline) => {
      if (!pendingLibraryFolder || !libraryStore) return;
      setLibraryFolderBusy(true);
      try {
        const source = await createLibrarySource(libraryStore, { name, category: pendingLibraryFolder.category, discipline, dirHandle: pendingLibraryFolder.dirHandle });
        const summary = await syncLibrarySource(libraryStore, source, { decode: browserImageSizeDecoder });
        await userStampLibrary.reload();
        const count = summary.added + summary.updated;
        setStatus(`Loaded ${count} stamp${count === 1 ? '' : 's'} from "${name}".`);
      } catch (err) {
        await userStampLibrary.reload().catch(() => undefined);
        setStatus(`Could not load the folder "${name}": ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLibraryFolderBusy(false);
        setPendingLibraryFolder(null);
      }
    },
    [pendingLibraryFolder, libraryStore, userStampLibrary],
  );

  const handleSyncLibrarySource = useCallback(
    async (source: LibrarySourceRecord) => {
      if (!libraryStore || !source.dirHandle) return;
      // Permission first: requestPermission needs the user gesture of this click.
      if (!(await ensureReadPermission(source.dirHandle))) {
        setStatus('Permission refused.');
        return;
      }
      setSyncingSourceId(source.id);
      try {
        const summary = await syncLibrarySource(libraryStore, source, { decode: browserImageSizeDecoder });
        await userStampLibrary.reload();
        setStatus(`Synced "${source.name}": ${summary.added} added, ${summary.updated} updated, ${summary.missing} missing from the folder.`);
      } catch (err) {
        setStatus(`Could not sync "${source.name}": ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSyncingSourceId(null);
      }
    },
    [libraryStore, userStampLibrary],
  );

  const handleRemoveLibrarySource = useCallback(
    async (source: LibrarySourceRecord) => {
      if (!libraryStore) return;
      if (!window.confirm(`Remove the folder "${source.name}" and its stamps from MepApp? The files in the folder stay. Stamps already placed in a project keep their own copy.`)) return;
      try {
        await libraryStore.removeSource(source.id);
        await userStampLibrary.reload();
        setStatus(`Removed "${source.name}".`);
      } catch (err) {
        setStatus(`Could not remove "${source.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [libraryStore, userStampLibrary],
  );

  const handleNetworkTypePick = useCallback(
    (type: NetworkType) => {
      sceneRef.current?.setActiveNetworkType(type);
      setActiveNetworkTypeId(type.id);
      setStatus(`${type.name} is now the active network type — new segments will be tagged with it.`);
    },
    [sceneRef],
  );

  const handleRenameNetworkType = useCallback(
    (id: string, name: string) => {
      sceneRef.current?.renameNetworkType(id, name);
    },
    [sceneRef],
  );

  const handleSaveNetworkType = useCallback(
    (id: string, patch: NetworkTypeEditPatch) => {
      sceneRef.current?.updateNetworkType(id, patch);
      setNetworkTypeEditorTarget(null);
    },
    [sceneRef],
  );

  const handleDuplicateNetworkType = useCallback(
    (id: string) => {
      const copy = sceneRef.current?.duplicateNetworkType(id);
      if (copy) setNetworkTypeEditorTarget(copy);
    },
    [sceneRef],
  );

  // Each network's own totalCapacity (the root's subtree demand), not a sum of every
  // segment's value — a segment's value is already a subtree total on its own, so
  // summing all of them would over-count everything except the leaf segments.
  const totalFlowCapacity = flowResult
    ? flowResult.reduce((sum, r) => sum + (r.totalCapacity ?? 0), 0)
    : null;

  const dockTabDefs: DockTabDef[] = [
    { id: 'stamps', label: 'MEP' },
    { id: 'drawings', label: 'Drawings' },
    { id: 'networks', label: 'Networks' },
    { id: 'properties', label: 'Properties' },
  ];

  const dockContent: Record<string, ReactNode> = {
    stamps: (
      <StampsPanel
        sceneRef={sceneRef}
        disciplineGroup={disciplineGroup}
        onChangeDisciplineGroup={setDisciplineGroup}
        labelLanguage={labelLanguage}
        onChangeLabelLanguage={handleChangeLabelLanguage}
        activeDefinitionId={activeDefinitionId}
        onPick={handleStampPick}
        categoryFilter={stampCategoryFilter}
        onChangeCategoryFilter={setStampCategoryFilter}
        customStampDefinitions={customStampDefinitions}
        onCreateCustomElement={() => setElementEditorTarget({ mode: 'create' })}
        onDuplicateStampDefinition={(definition) => void handleDuplicateStampDefinition(definition)}
        onEditCustomStampDefinition={(definitionId) => setElementEditorTarget({ mode: 'edit', definitionId })}
        onDeleteCustomStampDefinition={handleDeleteCustomStampDefinition}
        resolveIconUrl={resolveStampIconUrl}
        networkTypes={networkTypes}
        activeNetworkTypeId={activeNetworkTypeId}
        onPickNetworkType={handleNetworkTypePick}
        onEditNetworkType={setNetworkTypeEditorTarget}
        userStampDefinitions={userStampLibrary.definitions}
        missingUserStampIds={missingUserStampIds}
        userLibraryAvailable={userStampLibrary.available}
        onLoadUserFolder={(category) => void handleLoadUserFolder(category)}
        onOpenLibraryFolders={() => setLibraryFoldersOpen(true)}
        materializeUserStamp={userStampLibrary.materialize}
        showBuiltIn={showBuiltInStamps}
        libraryRecordIds={userStampLibrary.allRecordIds}
        savedUserStampIds={savedUserStampIds}
        onEditUserStamp={(stampId) => void handleEditUserStamp(stampId)}
        onDeleteUserStamp={(definition) => void handleDeleteUserStamp(definition)}
        onBulkDelete={handleBulkDelete}
      />
    ),
    drawings: (
      <DrawingsPanel documents={documents} activeDocumentId={activeDocumentId} onActivate={handleActivateDocument} onClose={handleCloseDocument} />
    ),
    networks: (
      <div>
        <div className="mep-section">
          <button className="mep-icon-btn" onClick={() => sceneRef.current?.computeFlow()}>
            <IconFlow size={13} /> Solve flow
          </button>
          {totalFlowCapacity !== null && (
            <div className="mep-flow-result" style={{ marginTop: 8 }}>
              {totalFlowCapacity} total capacity across {flowResult?.length ?? 0} network{flowResult?.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <NetworkTreePanel
          sceneRef={sceneRef}
          networkSummaries={networkSummaries}
          allStamps={allStamps}
          selection={selection}
          onRenameNetworkType={handleRenameNetworkType}
          circuits={circuits}
          panels={panels}
          panelSections={panelSections}
          circuitTypes={circuitTypes}
          selectedCircuitId={selectedCircuitId}
          selectedPanelId={selectedPanelId}
          onSelectCircuit={setSelectedCircuitId}
          onSelectPanel={setSelectedPanelId}
          onCreateCircuit={(panelId) => setSelectedCircuitId(sceneRef.current?.createCircuit({ panelId }) ?? null)}
          treeState={networkTreeState}
          onDeleteCircuit={(id) => {
            sceneRef.current?.deleteCircuit(id);
            if (selectedCircuitId === id) setSelectedCircuitId(null);
          }}
          showCircuitLines={showCircuitLines}
          onToggleCircuitLines={() => setShowCircuitLines((show) => !show)}
        />
      </div>
    ),
    properties: (
      <PropertiesPanel
        selectedRooms={selectedRooms}
        calibration={calibration}
        sceneRef={sceneRef}
        selection={selection}
        selectedSegment={selectedSegment}
        selectedSegments={selectedSegments}
        selectedFitting={selectedFitting}
        networkTypes={networkTypes}
        customPropertyDefs={customPropertyDefs}
        customStampDefinitions={customStampDefinitions}
        labelLanguage={labelLanguage}
        onOpenSchematic={setSchematicPanelId}
        onEditStamp={handleEditPlacedStamp}
        onReplaceStamps={() => setReplacePickerOpen(true)}
        circuits={circuits}
        panels={panels}
        panelSections={panelSections}
        circuitTypes={circuitTypes}
        selectedCircuitId={selectedCircuitId}
        selectedPanelId={selectedPanelId}
        setSelectedCircuitId={setSelectedCircuitId}
        allStamps={allStamps}
        showCircuitLines={showCircuitLines}
        onToggleCircuitLines={() => setShowCircuitLines((show) => !show)}
        setSelectedPanelId={setSelectedPanelId}
      />
    ),
  };

  const [forcedTabId, setForcedTabId] = useState<string | null>(null);
  const [forcedTabNonce, setForcedTabNonce] = useState(0);
  // Ids only: an edit of a selected room must not pull the dock back after the user picked another tab.
  const selectedRoomKey = selectedRooms.map((r) => r.id).join(',');
  useEffect(() => {
    // A room selected with a room tool (a click with Edit rooms, or the room Fill room just placed) shows its number and name in Properties.
    if ((tool === 'edit-room' || tool === 'fill-room' || tool === 'split-room') && selectedRoomKey !== '') {
      setForcedTabId('properties');
      setForcedTabNonce((n) => n + 1);
      return;
    }
    if (tool === 'place-terminal' || tool === 'place-equipment') {
      // Jump to the MEP tab so the user sees which stamp is armed and can pick a different one.
      setForcedTabId('stamps');
      setForcedTabNonce((n) => n + 1);
      return;
    }
    // The dock jumps to Properties only for a selection the user made with a click on the canvas.
    // Anything made in a panel (a Networks-tree row, a Properties link, a circuit or panel picked in
    // the tree or the Circuits toolbar) leaves the dock alone, so the user can keep navigating the
    // tree; so does a running Add-terminals or Assign-panel tool. "Leaves the dock alone" means
    // returning without touching forcedTabId: setting it to null would release an earlier canvas-click
    // force and send the dock back to the tab the user had before that click.
    // Placing a stamp auto-selects it (see SketchScene.placeStamp), but place-terminal/place-equipment
    // is handled above and never reaches here while armed.
    if (tool === 'circuit-add-terminals' || tool === 'circuit-assign-panel') return;
    if (selectedCircuitId || selectedPanelId) return;
    const canvasSelection = (selection.length > 0 && selectionFromCanvas) || selectedSegment || selectedSegments.length > 0 || selectedFitting;
    if (selection.length > 0 && !selectionFromCanvas && !canvasSelection) return;
    // A drawingChanged (Undo, a stamp move) re-runs this effect with a fresh selectedSegments array;
    // a canvas selection must keep resolving to 'properties', or that re-run would release the dock.
    setForcedTabId((tool === 'select' || tool === 'circuits') && canvasSelection ? 'properties' : null);
    setForcedTabNonce((n) => n + 1);
  }, [selection, selectionFromCanvas, selectedSegment, selectedSegments, selectedFitting, selectedCircuitId, selectedPanelId, tool, selectedRoomKey]);

  // A circuit or panel that disappears (delete, or Undo of its creation) cannot stay selected in the tree.
  useEffect(() => {
    if (selectedCircuitId && !circuits.some((c) => c.id === selectedCircuitId)) setSelectedCircuitId(null);
    if (selectedPanelId && !panels.some((p) => p.id === selectedPanelId)) setSelectedPanelId(null);
  }, [circuits, panels, selectedCircuitId, selectedPanelId, setSelectedCircuitId, setSelectedPanelId]);

  // Circuits mode (Phase E4) turns the connection lines on while it is active and off when the user leaves
  // it, and opens the Networks tab so the circuit tree is in view. Any tool of the circuits family counts:
  // starting Add terminals from the Properties panel enters the family too.
  const inCircuitsFamily = isCircuitsTool(tool);
  const wasInCircuitsFamily = useRef(false);
  useEffect(() => {
    if (inCircuitsFamily === wasInCircuitsFamily.current) return;
    wasInCircuitsFamily.current = inCircuitsFamily;
    setShowCircuitLines(inCircuitsFamily);
    if (inCircuitsFamily && tool === 'circuits') {
      setForcedTabId('networks');
      setForcedTabNonce((n) => n + 1);
    }
  }, [inCircuitsFamily, tool, setShowCircuitLines]);

  return (
    <div className="mep-app">
      {!onboardingSeen && <WelcomeScreen onDismiss={handleDismissOnboarding} />}
      <div className="mep-header">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <MenuButton
          onOpenPdf={handleOpenPdf}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenGlobalProperties={() => setGlobalPropertiesOpen(true)}
          onOpenManageBuildings={() => setManageBuildingsOpen(true)}
          pdfLoaded={pdfHandle !== null}
          roomsAvailable={createRoomDetectionClient !== undefined}
          roomsDetecting={roomsDetecting}
          onDetectRooms={handleDetectRooms}
          onCancelRoomDetection={handleCancelRoomDetection}
          onExportRooms={handleExportRooms}
          wallDebugVisible={wallDebugVisible}
          onToggleWallDebug={handleToggleWallDebug}
        />
        <DocumentSwitcher documents={documents} activeDocumentId={activeDocumentId} onActivate={handleActivateDocument} onClose={handleCloseDocument} />
        <RoomToolBar tool={tool} sceneRef={sceneRef} />
        <div className="mep-fill" />
        {status && <span className="mep-header-status">{status}</span>}
      </div>

      {reconciliation && (
        <div className="mep-banner">
          This PDF's annotations differ from its saved project data since it was last opened here.{' '}
          {reconciliation.missingIds.length > 0 && (
            <span>{reconciliation.missingIds.length} annotation{reconciliation.missingIds.length === 1 ? '' : 's'} missing (deleted in another viewer). </span>
          )}
          {reconciliation.drifted.length > 0 && (
            <span>{reconciliation.drifted.length} annotation{reconciliation.drifted.length === 1 ? '' : 's'} moved in another viewer. </span>
          )}
          Click "Save" to rewrite them from the current drawing, or edit the drawing first if you want to keep the other viewer's changes instead.{' '}
          <button onClick={() => setReconciliation(null)}>Dismiss</button>
        </div>
      )}

      <div className="mep-body">
        <div className="mep-canvas-wrap" ref={containerRef}>
          {!ready && <div className="mep-canvas-init">Initializing canvas…</div>}
          {ready && (
            <>
              <Rail
                tool={tool}
                sceneRef={sceneRef}
                stampReady={activeDefinitionId !== null || tool === 'place-terminal' || tool === 'place-equipment'}
                hasSelection={hasSelection}
                canUndo={drawingSummary.canUndo}
                canRedo={drawingSummary.canRedo}
                onUndo={() => sceneRef.current?.undoDrawing()}
                onRedo={() => sceneRef.current?.redoDrawing()}
                onOpenSettings={() => setSettingsOpen(true)}
                onPickDefaultStamp={handlePickDefaultStamp}
              />
              <WallDebugPanel sceneRef={sceneRef} ready={ready} />
              {textboxPrompt && (
                <textarea
                  ref={textboxRef}
                  rows={2}
                  className="mep-textbox-prompt"
                  style={{ left: textboxPrompt.screenPosition.x, top: textboxPrompt.screenPosition.y }}
                  value={textboxInput}
                  onChange={(e) => setTextboxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      textboxPrompt.resolve(textboxInput);
                      setTextboxPrompt(null);
                      setTextboxInput('');
                    } else if (e.key === 'Escape') {
                      textboxPrompt.resolve(null);
                      setTextboxPrompt(null);
                      setTextboxInput('');
                    }
                  }}
                  onBlur={() => {
                    textboxPrompt.resolve(textboxInput);
                    setTextboxPrompt(null);
                    setTextboxInput('');
                  }}
                />
              )}
              {isCircuitsTool(tool) && (
                <CircuitsToolbar
                  sceneRef={sceneRef}
                  tool={tool}
                  circuits={circuits}
                  panels={panels}
                  selection={selection}
                  selectedCircuitId={selectedCircuitId}
                  circuitToolTargetId={circuitToolTargetId}
                  setSelectedCircuitId={setSelectedCircuitId}
                  showCircuitLines={showCircuitLines}
                  onToggleCircuitLines={setShowCircuitLines}
                  onOpenCircuitTypes={() => setCircuitTypesOpen(true)}
                />
              )}
              <ToastStack toasts={toasts} onDismiss={dismissToast} />
              {canvasContextMenuRequest && (
                <CanvasContextMenu request={canvasContextMenuRequest} sceneRef={sceneRef} onDismiss={() => setCanvasContextMenuRequest(null)} />
              )}
            </>
          )}
        </div>
        <DockPanel tabs={dockTabDefs} content={dockContent} forcedTabId={forcedTabId} forcedTabNonce={forcedTabNonce} />
      </div>

      <StatusBar
        zoom={zoom}
        onZoomBy={(factor) => sceneRef.current?.zoomBy(factor)}
        onResetZoom={() => sceneRef.current?.resetZoom()}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onChangePage={(next) => void handleChangePage(next)}
        calibration={calibration}
        onSetScale={(denominator) => sceneRef.current?.setCalibration(calibrationFromScale(denominator))}
        measurementMm={measurementMm}
        selectedCount={selection.length}
        drawingSummary={drawingSummary}
        labelVisibility={labelVisibility}
        onLabelVisibilityChange={handleLabelVisibilityChange}
        labelFilterEntries={labelFilterEntries}
        roomsVisible={roomsVisible}
        onRoomsVisibleChange={(visible) => sceneRef.current?.setRoomsVisible(visible)}
      />

      {calibrationPrompt && (
        <CalibrationDialog
          p1={calibrationPrompt.p1}
          p2={calibrationPrompt.p2}
          onCancel={() => {
            calibrationPrompt.resolve(null);
            setCalibrationPrompt(null);
          }}
          onSubmit={(distanceMm) => {
            calibrationPrompt.resolve(distanceMm);
            setCalibrationPrompt(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          snapRadiusPx={snapRadiusPx}
          onChangeSnapRadiusPx={handleChangeSnapRadiusPx}
          angleSnapDegrees={angleSnapDegrees}
          onChangeAngleSnapDegrees={handleChangeAngleSnapDegrees}
          roomGapMm={roomGapMm}
          onChangeRoomGapMm={(mm) => {
            setRoomGapMm(mm);
            storeNumber(ROOM_GAP_STORAGE_KEY, mm);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {globalPropertiesOpen && (
        <GlobalPropertiesDialog
          definitions={customPropertyDefs}
          onSave={handleSaveCustomPropertyDefs}
          onClose={() => setGlobalPropertiesOpen(false)}
        />
      )}

      {pendingLibraryFolder && (
        <LibrarySourceDialog
          category={pendingLibraryFolder.category}
          defaultName={pendingLibraryFolder.dirHandle.name}
          defaultDiscipline={defaultDisciplineFor(disciplineGroup)}
          busy={libraryFolderBusy}
          showBuiltIn={showBuiltInStamps}
          onChangeShowBuiltIn={setShowBuiltInStamps}
          onSubmit={(name, discipline) => void handleConfirmLibraryFolder(name, discipline)}
          onCancel={() => {
            if (!libraryFolderBusy) setPendingLibraryFolder(null);
          }}
        />
      )}

      {libraryFoldersOpen && (
        <LibraryFoldersDialog
          available={userStampLibrary.available}
          sources={userStampLibrary.sources}
          records={userStampLibrary.records}
          busySourceId={syncingSourceId}
          onSync={(source) => void handleSyncLibrarySource(source)}
          onRemove={(source) => void handleRemoveLibrarySource(source)}
          onShowHidden={(source) => void handleShowHiddenStamps(source)}
          showBuiltIn={showBuiltInStamps}
          onChangeShowBuiltIn={setShowBuiltInStamps}
          onAddFolder={(category) => {
            setLibraryFoldersOpen(false);
            void handleLoadUserFolder(category);
          }}
          onClose={() => setLibraryFoldersOpen(false)}
        />
      )}

      {manageBuildingsOpen && (
        <ManageBuildingsDialog
          buildings={buildings}
          onChange={handleChangeBuildings}
          currentDocumentFileName={sheetName}
          onClose={() => setManageBuildingsOpen(false)}
        />
      )}

      {elementEditorTarget && (
        <ElementEditorDialog
          definition={
            elementEditorTarget.mode === 'edit'
              ? customStampDefinitions.find((d) => d.id === elementEditorTarget.definitionId)
              : elementEditorTarget.mode === 'duplicate'
                ? elementEditorTarget.seed
                : elementEditorTarget.mode === 'edit-user'
                  ? elementEditorTarget.definition
                  : undefined
          }
          existingCustomDefinitions={customStampDefinitions}
          labelLanguage={labelLanguage}
          initialLabels={
            elementEditorTarget.mode === 'edit'
              ? stampLabelLayouts[elementEditorTarget.definitionId]
              : elementEditorTarget.mode === 'duplicate'
                ? stampLabelLayouts[elementEditorTarget.seed.id]
                : elementEditorTarget.mode === 'edit-user'
                  ? stampLabelLayouts[elementEditorTarget.definition.id]
                  : undefined
          }
          labelPropertyContext={labelPropertyContext}
          countLostPortConnections={(def) => sceneRef.current?.countLostPortConnections(def.id, def.ports) ?? 0}
          onSave={elementEditorTarget.mode === 'edit-user' ? (built, labels) => void handleSaveUserStamp(built, labels) : handleSaveElementDefinition}
          isNameTaken={(label) => userStampLabelTaken(label, [...STAMP_LIBRARY, ...customStampDefinitions, ...userStampLibrary.definitions])}
          onSaveAs={(built, labels) => void handleSaveUserStampAs(built, labels)}
          onClose={() => setElementEditorTarget(null)}
        />
      )}

      {replacePickerOpen && (
        <StampPickerDialog
          title="Replace stamp"
          initialCategory={selection[0]?.category === 'equipment' ? 'equipment' : 'terminal'}
          initialDisciplineGroup={disciplineGroup}
          labelLanguage={labelLanguage}
          customStampDefinitions={customStampDefinitions}
          userStampDefinitions={userStampLibrary.definitions}
          showBuiltIn={showBuiltInStamps}
          libraryRecordIds={userStampLibrary.allRecordIds}
          resolveIconUrl={resolveStampIconUrl}
          onPick={(definition) => void handleReplaceStamps(definition)}
          onClose={() => setReplacePickerOpen(false)}
        />
      )}

      {labelEditorStamp && labelEditorDefinition && (
        <StampLabelsDialog
          definition={labelEditorDefinition}
          iconUrl={labelEditorDefinition.iconRef.startsWith('data:') ? labelEditorDefinition.iconRef : resolveStampIconUrl(labelEditorDefinition.iconRef)}
          stamp={labelEditorStamp}
          initialLabels={sceneRef.current?.getStampLabelLayouts()[labelEditorDefinition.id] ?? []}
          propertyContext={labelPropertyContext}
          onSave={(labels) => {
            sceneRef.current?.setStampLabelLayout(labelEditorDefinition.id, labels);
            setLabelEditorStampId(null);
          }}
          onClose={() => setLabelEditorStampId(null)}
        />
      )}

      {networkTypeEditorTarget && (
        <NetworkTypeEditorDialog
          key={networkTypeEditorTarget.id}
          networkType={networkTypeEditorTarget}
          onSave={handleSaveNetworkType}
          onDuplicate={handleDuplicateNetworkType}
          onClose={() => setNetworkTypeEditorTarget(null)}
        />
      )}

      {schematicPanelId && (
        <SchematicDialog
          panelId={schematicPanelId}
          panels={panels}
          circuits={circuits}
          panelSections={panelSections}
          circuitTypes={circuitTypes}
          stamps={allStamps}
          customStampDefinitions={customStampDefinitions}
          schematics={schematics}
          projectFields={schematicProjectFields}
          onAddSchematic={(schematic) => sceneRef.current?.addSchematic(schematic)}
          onUpdateSchematic={(schematic) => sceneRef.current?.updateSchematic(schematic)}
          onRemoveSchematic={(schematicId) => sceneRef.current?.removeSchematic(schematicId)}
          onProjectFieldChange={(fieldId, value) => sceneRef.current?.setSchematicProjectField(fieldId, value)}
          customTemplates={customSchematicTemplates}
          onCustomTemplatesChange={setCustomSchematicTemplates}
          customSymbols={customSchematicSymbols}
          onCustomSymbolsChange={setCustomSchematicSymbols}
          templateId={schematicTemplateId}
          onTemplateIdChange={setSchematicTemplateId}
          onClose={() => setSchematicPanelId(null)}
        />
      )}
      {circuitTypesOpen && (
        <CircuitTypesDialog sceneRef={sceneRef} circuitTypes={circuitTypes} circuits={circuits} panels={panels} onClose={() => setCircuitTypesOpen(false)} />
      )}

      {correspondingSourceUrl && (
        <div className="mep-source-footer">
          MepApp is AGPLv3 licensed.{' '}
          <a href={correspondingSourceUrl} target="_blank" rel="noreferrer">
            View the source code for this exact version
          </a>
          .
        </div>
      )}
    </div>
  );
}
